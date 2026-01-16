/**
 * Content Script
 * Detects LinkedIn job pages, extracts job ID, and injects button
 */

// Button state management
let buttonState = {
  id: null,
  element: null,
  status: 'idle' // idle, loading, success, error, alreadySent
};

/**
 * Extract job ID from LinkedIn URL
 */
function extractJobId() {
  const url = window.location.href;
  console.log('[Content Script] 🔍 Extracting Job ID from URL:', url);
  
  // Pattern 1: linkedin.com/jobs/collections/*?currentJobId=XXXXX
  const collectionMatch = url.match(/[?&]currentJobId=(\d+)/);
  if (collectionMatch) {
    console.log('[Content Script] ✅ Job ID extracted (Pattern 1 - collection):', collectionMatch[1]);
    return collectionMatch[1];
  }
  
  // Pattern 2: linkedin.com/jobs/view/XXXXX
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) {
    console.log('[Content Script] ✅ Job ID extracted (Pattern 2 - view):', viewMatch[1]);
    return viewMatch[1];
  }
  
  // Pattern 3: linkedin.com/jobs/search/?currentJobId=XXXXX
  const searchMatch = url.match(/\/jobs\/search\/[^?]*[?&]currentJobId=(\d+)/);
  if (searchMatch) {
    console.log('[Content Script] ✅ Job ID extracted (Pattern 3 - search):', searchMatch[1]);
    return searchMatch[1];
  }
  
  console.log('[Content Script] ❌ No Job ID found in URL');
  return null;
}

/**
 * Construct full LinkedIn job URL from job ID
 */
function constructJobUrl(jobId) {
  const jobUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
  console.log('[Content Script] 🔗 Constructed Job URL:', jobUrl);
  return jobUrl;
}

/**
 * Extract "About the job" section comprehensively
 * Attempts to expand the section if collapsed and extracts all content
 */
async function extractAboutTheJobSection() {
  console.log('[Content Script] 📋 Starting "About the job" section extraction...');
  
  // Helper function to find element by text content
  function findElementByText(selector, text) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (element.textContent && element.textContent.includes(text)) {
        return element;
      }
    }
    return null;
  }

  // Try to find and expand "See more" button
  async function tryExpandSection() {
    const expandSelectors = [
      '.show-more-less-html__button.show-more-less-html__button--more',
      'button[aria-label*="more"]',
      '.show-more-less-html__button'
    ];

    for (const selector of expandSelectors) {
      try {
        // Try direct selector first
        let button = document.querySelector(selector);
        
        // If not found, try to find by text
        if (!button) {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent || btn.getAttribute('aria-label') || '';
            if (text.toLowerCase().includes('see more') || 
                text.toLowerCase().includes('show more') ||
                text.toLowerCase().includes('more')) {
              // Check if it's inside a job description section
              const parent = btn.closest('section') || btn.closest('.jobs-description') || btn.closest('[class*="description"]');
              if (parent) {
                button = btn;
                break;
              }
            }
          }
        }

        if (button && button.offsetParent !== null) { // Check if visible
          console.log('[Content Script] 🔍 Found expand button, attempting to click...');
          button.click();
          // Wait for content to expand
          await new Promise(resolve => setTimeout(resolve, 800));
          console.log('[Content Script] ✅ Clicked expand button, waiting for content...');
          return true;
        }
      } catch (error) {
        console.log('[Content Script] ⚠️ Error trying to expand with selector:', selector, error);
      }
    }
    return false;
  }

  // Try to expand section first
  await tryExpandSection();

  // Selectors for "About the job" section
  const aboutJobSelectors = [
    // Try to find section with "About the job" heading first
    'section h2',
    'section h3',
    // Direct selectors for expanded content
    '.show-more-less-html__markup--expanded',
    '.show-more-less-html__markup',
    '.jobs-description__text',
    '.jobs-box__html-content',
    '.jobs-description-content__text',
    '[data-test-id="job-description"]',
    '.jobs-description',
    '.jobs-details__main-content .jobs-box__html-content',
    'section[class*="description"]',
    'div[class*="description"]'
  ];

  // First, try to find section by heading "About the job"
  const headings = document.querySelectorAll('h2, h3');
  let aboutJobSection = null;
  
  for (const heading of headings) {
    const headingText = heading.textContent?.trim() || '';
    if (headingText.toLowerCase().includes('about the job') || 
        headingText.toLowerCase().includes('job description') ||
        headingText.toLowerCase().includes('role overview')) {
      console.log('[Content Script] ✅ Found "About the job" heading:', headingText);
      // Find the content section after this heading
      let nextElement = heading.nextElementSibling;
      while (nextElement && !aboutJobSection) {
        // Check if it contains the markup class
        const markup = nextElement.querySelector('.show-more-less-html__markup') || 
                      nextElement.querySelector('.jobs-description__text') ||
                      nextElement.querySelector('.jobs-box__html-content');
        if (markup) {
          aboutJobSection = markup;
          break;
        }
        // If the element itself has the class
        if (nextElement.classList.contains('show-more-less-html__markup') ||
            nextElement.classList.contains('jobs-description__text') ||
            nextElement.classList.contains('jobs-box__html-content')) {
          aboutJobSection = nextElement;
          break;
        }
        nextElement = nextElement.nextElementSibling;
      }
      // If not found in siblings, try parent
      if (!aboutJobSection) {
        const parent = heading.closest('section') || heading.parentElement;
        if (parent) {
          const markup = parent.querySelector('.show-more-less-html__markup') || 
                        parent.querySelector('.jobs-description__text') ||
                        parent.querySelector('.jobs-box__html-content');
          if (markup) {
            aboutJobSection = markup;
          } else if (parent.classList.contains('show-more-less-html__markup') ||
                     parent.classList.contains('jobs-description__text')) {
            aboutJobSection = parent;
          }
        }
      }
      break;
    }
  }

  // If found by heading, extract from it
  if (aboutJobSection) {
    const text = aboutJobSection.innerText || aboutJobSection.textContent || '';
    if (text.trim().length > 50) {
      console.log('[Content Script] ✅ Extracted "About the job" from heading section (length:', text.length, 'chars)');
      console.log('─'.repeat(80));
      console.log('[Content Script] 📋 EXTRACTED "ABOUT THE JOB" CONTENT (FULL):');
      console.log(text.trim());
      console.log('─'.repeat(80));
      return text.trim();
    }
  }

  // Try all selectors
  console.log('[Content Script] 🔎 Trying', aboutJobSelectors.length, 'selectors for "About the job" section...');
  for (const selector of aboutJobSelectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        // Make sure it's actually job description content (not other sections)
        const text = element.innerText || element.textContent || '';
        if (text.trim().length > 100) { // Need substantial content
          // Additional check: make sure it's not just a small snippet
          const parentText = element.parentElement?.textContent || '';
          // If this element is inside a larger section with "About the job", prefer the parent
          if (parentText.toLowerCase().includes('about the job') && 
              parentText.length > text.length) {
            const parentElement = element.closest('section') || element.parentElement;
            if (parentElement) {
              const parentTextContent = parentElement.innerText || parentElement.textContent || '';
              if (parentTextContent.trim().length > text.length) {
                console.log('[Content Script] ✅ Found "About the job" using selector "' + selector + '" (from parent, length:', parentTextContent.length, 'chars)');
                console.log('─'.repeat(80));
                console.log('[Content Script] 📋 EXTRACTED "ABOUT THE JOB" CONTENT (FULL - FROM PARENT):');
                console.log(parentTextContent.trim());
                console.log('─'.repeat(80));
                return parentTextContent.trim();
              }
            }
          }
          console.log('[Content Script] ✅ Found "About the job" using selector "' + selector + '" (length:', text.length, 'chars)');
          console.log('─'.repeat(80));
          console.log('[Content Script] 📋 EXTRACTED "ABOUT THE JOB" CONTENT (FULL):');
          console.log(text.trim());
          console.log('─'.repeat(80));
          return text.trim();
        }
      }
    } catch (error) {
      console.log('[Content Script] ⚠️ Error with selector "' + selector + '":', error);
    }
  }

  console.log('[Content Script] ❌ "About the job" section not found with any selector');
  return '';
}

/**
 * Extract job information from top card container
 * Finds the top card section above buttons and extracts title, company, location comprehensively
 */
function extractFromTopCardContainer() {
  console.log('[Content Script] 🔍 Looking for top card container...');
  
  // Try to find the top card container
  const topCardSelectors = [
    '.jobs-details-top-card',
    '[class*="jobs-details-top-card"]',
    '.jobs-details__top-card',
    '.jobs-details__main-content > div:first-child',
    'main > div:first-child > div:first-child'
  ];
  
  let topCardContainer = null;
  for (const selector of topCardSelectors) {
    topCardContainer = document.querySelector(selector);
    if (topCardContainer) {
      console.log(`[Content Script] ✅ Found top card container using selector: "${selector}"`);
      break;
    }
  }
  
  if (!topCardContainer) {
    console.log('[Content Script] ⚠️ Top card container not found, will use fallback selectors');
    return { title: '', company: '', location: '' };
  }
  
  const containerText = topCardContainer.textContent || '';
  const containerHTML = topCardContainer.innerHTML || '';
  console.log('[Content Script] 📋 Top card container found, analyzing structure...');
  console.log('[Content Script] 📏 Container text length:', containerText.length, 'chars');
  
  const result = { title: '', company: '', location: '' };
  
  // Extract title - look for h1 or heading elements first
  const titleSelectors = [
    'h1',
    'h1.jobs-details-top-card__job-title',
    'h1[class*="job-title"]',
    '.jobs-details-top-card__job-title',
    '.jobs-details-top-card__job-title-link',
    '[data-test-id="job-title"]',
    'h2',
    'h3'
  ];
  
  for (const selector of titleSelectors) {
    const element = topCardContainer.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim() || '';
      if (text && text.length > 3) {
        result.title = text;
        console.log(`[Content Script] ✅ Found title in container using "${selector}":`, text.substring(0, 80));
        break;
      }
    }
  }
  
  // Extract company - look for links and company-related elements
  const companySelectors = [
    '.jobs-details-top-card__company-name',
    '.jobs-details-top-card__company-name a',
    '.jobs-details-top-card__company-info a',
    'a[data-test-id="company-name"]',
    '[data-test-id="company-name"]',
    '.jobs-company__box a',
    'a[href*="/company/"]',
    'a[href*="/company"]'
  ];
  
  for (const selector of companySelectors) {
    const element = topCardContainer.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim() || '';
      if (text && text.length > 1) {
        result.company = text;
        console.log(`[Content Script] ✅ Found company in container using "${selector}":`, text);
        break;
      }
    }
  }
  
  // Extract location - look for location indicators and bullet points
  const locationSelectors = [
    '.jobs-details-top-card__bullet',
    '.jobs-details-top-card__job-info-item',
    '.jobs-details-top-card__primary-description-without-tagline',
    '[data-test-id="job-location"]',
    '.jobs-details-top-card__job-info li',
    '.jobs-details-top-card__job-info span',
    'span[class*="location"]',
    'span[class*="bullet"]',
    'li[class*="job-info"]'
  ];
  
  for (const selector of locationSelectors) {
    const elements = topCardContainer.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent?.trim() || '';
      // Location usually contains city, country, or "Remote"
      if (text && (text.includes(',') || text.includes('Remote') || text.match(/[A-Z][a-z]+/))) {
        result.location = text;
        console.log(`[Content Script] ✅ Found location in container using "${selector}":`, text);
        break;
      }
    }
    if (result.location) break;
  }
  
  // Fallback: Parse container text if specific selectors didn't work
  if (!result.title || !result.company || !result.location) {
    console.log('[Content Script] 🔄 Some fields missing, attempting text parsing fallback...');
    
    // Try to extract from structured text
    const lines = containerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log('[Content Script] 📝 Container has', lines.length, 'non-empty lines');
    
    // Title is usually the first significant line (h1 content)
    if (!result.title && lines.length > 0) {
      // Skip very short lines and button text
      for (const line of lines) {
        if (line.length > 5 && 
            !line.toLowerCase().includes('apply') && 
            !line.toLowerCase().includes('save') &&
            !line.match(/^\d+$/)) {
          result.title = line;
          console.log('[Content Script] ✅ Extracted title from text parsing:', result.title);
          break;
        }
      }
    }
    
    // Company usually appears after title
    if (!result.company) {
      let foundTitle = false;
      for (const line of lines) {
        if (foundTitle && line.length > 2 && line.length < 100) {
          // Skip common non-company text
          if (!line.toLowerCase().includes('full-time') &&
              !line.toLowerCase().includes('part-time') &&
              !line.toLowerCase().includes('contract') &&
              !line.match(/^\d+\s*(applicants?|views?)$/i)) {
            result.company = line;
            console.log('[Content Script] ✅ Extracted company from text parsing:', result.company);
            break;
          }
        }
        if (line === result.title) {
          foundTitle = true;
        }
      }
    }
    
    // Location usually has comma, "Remote", or city name pattern
    if (!result.location) {
      for (const line of lines) {
        if ((line.includes(',') || 
             line.toLowerCase().includes('remote') ||
             line.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)*$/)) &&
            line.length < 100) {
          result.location = line;
          console.log('[Content Script] ✅ Extracted location from text parsing:', result.location);
          break;
        }
      }
    }
  }
  
  return result;
}

/**
 * Extract job information from DOM
 * Tries multiple selectors to find job title, company, location, and description
 */
async function extractJobInfoFromDOM() {
  console.log('[Content Script] 📄 Starting DOM extraction...');
  const extractedData = {
    title: '',
    company: '',
    location: '',
    description: '',
    aboutTheJob: '',
    employmentType: '',
    experienceLevel: ''
  };

  // First, try to extract from top card container (comprehensive approach)
  console.log('[Content Script] 🎯 Step 1: Extracting from top card container...');
  const topCardData = extractFromTopCardContainer();
  
  // Use top card data if found
  if (topCardData.title) extractedData.title = topCardData.title;
  if (topCardData.company) extractedData.company = topCardData.company;
  if (topCardData.location) extractedData.location = topCardData.location;

  // Helper function to find text using multiple selectors
  function findText(selectors, fieldName) {
    console.log(`[Content Script] 🔎 Searching for ${fieldName} with ${selectors.length} selectors`);
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() || '';
        if (text) {
          console.log(`[Content Script] ✅ Found ${fieldName} using selector "${selector}":`, text.substring(0, 100) + (text.length > 100 ? '...' : ''));
          return text;
        }
      }
    }
    console.log(`[Content Script] ❌ ${fieldName} not found with any selector`);
    return '';
  }

  // Fallback: Extract job title if not found in container
  if (!extractedData.title) {
    console.log('[Content Script] 🎯 Step 2: Trying fallback selectors for title...');
    const titleSelectors = [
      '.jobs-details-top-card__job-title',
      'h1.job-title',
      'h1[class*="job-title"]',
      '.jobs-details-top-card__job-title-link',
      '[data-test-id="job-title"]',
      'h1'
    ];
    extractedData.title = findText(titleSelectors, 'title');
  }

  // Fallback: Extract company name if not found in container
  if (!extractedData.company) {
    console.log('[Content Script] 🎯 Step 3: Trying fallback selectors for company...');
    const companySelectors = [
      '.jobs-details-top-card__company-name',
      '.jobs-details-top-card__company-info a',
      'a[data-test-id="company-name"]',
      '.jobs-company__box a',
      '[data-test-id="company-name"]',
      '.jobs-details-top-card__company-name a'
    ];
    extractedData.company = findText(companySelectors, 'company');
  }

  // Fallback: Extract location if not found in container
  if (!extractedData.location) {
    console.log('[Content Script] 🎯 Step 4: Trying fallback selectors for location...');
    const locationSelectors = [
      '.jobs-details-top-card__bullet',
      '.jobs-details-top-card__job-info-item',
      '.jobs-details-top-card__primary-description-without-tagline',
      '[data-test-id="job-location"]',
      '.jobs-details-top-card__job-info li',
      '.jobs-details-top-card__job-info span'
    ];
    extractedData.location = findText(locationSelectors, 'location');
  }

  // Extract "About the job" section first (highest priority)
  extractedData.aboutTheJob = await extractAboutTheJobSection();
  
  // Use "About the job" as primary description if found
  if (extractedData.aboutTheJob && extractedData.aboutTheJob.length > 50) {
    extractedData.description = extractedData.aboutTheJob;
    console.log('[Content Script] ✅ Using "About the job" section as description (length:', extractedData.description.length, 'chars)');
  } else {
    // Fallback to old method if "About the job" not found
    console.log('[Content Script] ⚠️ "About the job" section not found or too short, trying fallback selectors...');
    const descriptionSelectors = [
      '.jobs-description__text',
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '[data-test-id="job-description"]',
      '.jobs-description',
      '.jobs-details__main-content .jobs-box__html-content'
    ];
    
    console.log('[Content Script] 🔎 Searching for description with', descriptionSelectors.length, 'selectors');
    // Try to get full description text
    for (const selector of descriptionSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Get all text content, including nested elements
        const text = element.innerText || element.textContent || '';
        if (text.trim().length > 50) { // Make sure we got substantial content
          extractedData.description = text.trim();
          console.log(`[Content Script] ✅ Found description using selector "${selector}" (length: ${text.length} chars)`);
          break;
        }
      }
    }
    if (!extractedData.description) {
      console.log('[Content Script] ❌ Description not found or too short');
    }
  }

  // Extract employment type and experience level from various places
  const jobInfoText = document.querySelector('.jobs-details-top-card__job-info')?.textContent || '';
  const allText = document.body.textContent || '';

  // Try to find employment type
  const employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Freelance'];
  for (const type of employmentTypes) {
    if (jobInfoText.includes(type) || allText.includes(type)) {
      extractedData.employmentType = type;
      console.log('[Content Script] ✅ Found employment type:', type);
      break;
    }
  }

  // Try to find experience level
  const experienceLevels = ['Entry level', 'Mid-Senior level', 'Senior', 'Associate', 'Executive', 'Director'];
  for (const level of experienceLevels) {
    if (jobInfoText.includes(level) || allText.includes(level)) {
      extractedData.experienceLevel = level;
      console.log('[Content Script] ✅ Found experience level:', level);
      break;
    }
  }

  console.log('[Content Script] 📊 DOM Extraction Complete - Summary:', {
    title: extractedData.title,
    company: extractedData.company,
    location: extractedData.location,
    descriptionLength: extractedData.description.length,
    aboutTheJobLength: extractedData.aboutTheJob.length,
    employmentType: extractedData.employmentType,
    experienceLevel: extractedData.experienceLevel
  });
  
  // Print full extracted data
  console.log('='.repeat(80));
  console.log('[Content Script] 📋 ========== FULL EXTRACTED DATA FROM DOM ==========');
  console.log('='.repeat(80));
  console.log('[Content Script] 📄 Title:', extractedData.title);
  console.log('[Content Script] 🏢 Company:', extractedData.company);
  console.log('[Content Script] 📍 Location:', extractedData.location);
  console.log('[Content Script] 💼 Employment Type:', extractedData.employmentType);
  console.log('[Content Script] 📊 Experience Level:', extractedData.experienceLevel);
  console.log('─'.repeat(80));
  console.log('[Content Script] 📝 Description (', extractedData.description.length, 'chars):');
  console.log(extractedData.description || '(empty)');
  console.log('─'.repeat(80));
  console.log('[Content Script] 📋 About The Job (', extractedData.aboutTheJob.length, 'chars):');
  console.log(extractedData.aboutTheJob || '(empty)');
  console.log('─'.repeat(80));
  console.log('[Content Script] 📦 Complete Data Object:');
  console.log(JSON.stringify(extractedData, null, 2));
  console.log('='.repeat(80));

  return extractedData;
}

/**
 * Find the container with Easy Apply and Save buttons
 */
function findButtonContainer() {
  // Try multiple selectors for LinkedIn's button container
  const selectors = [
    '.jobs-s-apply button', // Common selector
    '.jobs-apply-button', // Alternative
    '[data-test-modal]', // Modal trigger area
    '.jobs-details-top-card__actions', // Top card actions
    '.jobs-details__main-content .jobs-s-apply', // Main content area
    'div[class*="jobs-s-apply"]', // Flexible class matching
    '.jobs-details__actions', // Actions container
  ];

  for (const selector of selectors) {
    const container = document.querySelector(selector)?.closest('div')?.parentElement;
    if (container) {
      // Look for Easy Apply or Save buttons nearby
      const hasEasyApply = container.textContent.includes('Easy Apply') || 
                          container.querySelector('button[aria-label*="Easy Apply"]') ||
                          container.querySelector('button[aria-label*="Apply"]');
      const hasSave = container.textContent.includes('Save') ||
                     container.querySelector('button[aria-label*="Save"]');
      
      if (hasEasyApply || hasSave) {
        return container;
      }
    }
  }

  // Fallback: find any container with buttons that might be the action area
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const text = button.textContent || button.getAttribute('aria-label') || '';
    if (text.includes('Easy Apply') || text.includes('Apply')) {
      const container = button.closest('div')?.parentElement;
      if (container) {
        return container;
      }
    }
  }

  return null;
}

/**
 * Create the Send to SwiftCareer button
 */
function createButton() {
  const button = document.createElement('button');
  button.className = 'swiftcareer-send-button';
  button.setAttribute('aria-label', 'Send to SwiftCareer');
  
  const logoUrl = chrome.runtime.getURL('icons/logo.png');
  button.innerHTML = `
    <span class="swiftcareer-button-icon">
      <img src="${logoUrl}" alt="SwiftCareer" class="swiftcareer-logo">
    </span>
    <span class="swiftcareer-button-text">Send to SwiftCareer</span>
  `;
  
  button.addEventListener('click', handleButtonClick);
  
  return button;
}

/**
 * Update button state and appearance
 */
function updateButtonState(status, message = '') {
  console.log('[Content Script] 🔄 Updating button state:', status, message ? `(${message})` : '');
  buttonState.status = status;
  
  if (!buttonState.element) return;
  
  const button = buttonState.element;
  const icon = button.querySelector('.swiftcareer-button-icon');
  const text = button.querySelector('.swiftcareer-button-text');
  const logoImg = icon.querySelector('.swiftcareer-logo');
  
  // Reset classes
  button.className = 'swiftcareer-send-button';
  button.disabled = false;
  
  switch (status) {
    case 'loading':
      button.classList.add('loading');
      button.disabled = true;
      if (logoImg) logoImg.style.display = 'none';
      icon.textContent = '⏳';
      text.textContent = 'Sending...';
      break;
      
    case 'success':
      button.classList.add('success');
      if (logoImg) logoImg.style.display = 'none';
      icon.textContent = '✓';
      text.textContent = 'Sent successfully!';
      button.disabled = true;
      // Change to alreadySent after 3 seconds
      setTimeout(() => {
        if (buttonState.status === 'success') {
          updateButtonState('alreadySent');
        }
      }, 3000);
      break;
      
    case 'alreadySent':
      button.classList.add('already-sent');
      if (logoImg) logoImg.style.display = 'none';
      icon.textContent = '✓';
      text.textContent = 'Already sent';
      button.disabled = true;
      break;
      
    case 'error':
      button.classList.add('error');
      if (logoImg) logoImg.style.display = 'none';
      icon.textContent = '⚠';
      text.textContent = message || 'Error occurred';
      // Reset after 3 seconds
      setTimeout(() => {
        if (buttonState.status === 'error') {
          updateButtonState('idle');
        }
      }, 3000);
      break;
      
    case 'idle':
    default:
      icon.textContent = '';
      if (logoImg) {
        logoImg.style.display = 'inline-block';
      } else {
        // Recreate logo if it doesn't exist
        const logoUrl = chrome.runtime.getURL('icons/logo.png');
        const newLogo = document.createElement('img');
        newLogo.src = logoUrl;
        newLogo.alt = 'SwiftCareer';
        newLogo.className = 'swiftcareer-logo';
        icon.appendChild(newLogo);
      }
      text.textContent = 'Send to SwiftCareer';
      break;
  }
}

/**
 * Check if job already exists in database and update button state
 */
async function checkJobStatus() {
  const jobId = extractJobId();
  if (!jobId || !buttonState.element) {
    return;
  }
  
  try {
    // Check authentication first
    const authResponse = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    if (!authResponse.success || !authResponse.authenticated) {
      return;
    }
    
    const jobUrl = constructJobUrl(jobId);
    const checkResponse = await chrome.runtime.sendMessage({
      action: 'checkJobExists',
      userId: authResponse.user.id,
      jobUrl
    });
    
    if (checkResponse.success && checkResponse.exists) {
      console.log('[Content Script] ℹ️ Job already exists, updating button to alreadySent');
      updateButtonState('alreadySent');
    }
  } catch (error) {
    console.log('[Content Script] ⚠️ Error checking job status:', error);
    // Don't update state on error, just log it
  }
}

/**
 * Handle button click
 */
async function handleButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  console.log('[Content Script] 🖱️ Button clicked');
  
  const jobId = extractJobId();
  if (!jobId) {
    console.log('[Content Script] ❌ Could not extract job ID');
    updateButtonState('error', 'Could not extract job ID');
    return;
  }
  
  const jobUrl = constructJobUrl(jobId);
  
  // Check authentication
  console.log('[Content Script] 🔐 Checking authentication...');
  const authMessage = { action: 'checkAuth' };
  console.log('[Content Script] 📤 Sending message to background:', authMessage);
  const authResponse = await chrome.runtime.sendMessage(authMessage);
  console.log('[Content Script] 📥 Received auth response:', authResponse);
  
  if (!authResponse.success || !authResponse.authenticated) {
    console.log('[Content Script] ❌ Not authenticated, opening auth popup');
    // Open popup for authentication
    chrome.runtime.sendMessage({ action: 'openAuth' });
    updateButtonState('error', 'Please sign in first');
    return;
  }
  
  const userId = authResponse.user.id;
  console.log('[Content Script] ✅ Authenticated, User ID:', userId);
  
  // Extract job information from DOM as fallback
  const extractedJobData = await extractJobInfoFromDOM();
  
  // Print all extracted data in full detail before sending to background
  console.log('='.repeat(80));
  console.log('[Content Script] 📋 ========== ALL EXTRACTED DATA (BEFORE SENDING) ==========');
  console.log('='.repeat(80));
  console.log('[Content Script] 📄 Job Title:', extractedJobData.title);
  console.log('[Content Script] 🏢 Company:', extractedJobData.company);
  console.log('[Content Script] 📍 Location:', extractedJobData.location);
  console.log('[Content Script] 💼 Employment Type:', extractedJobData.employmentType);
  console.log('[Content Script] 📊 Experience Level:', extractedJobData.experienceLevel);
  console.log('─'.repeat(80));
  console.log('[Content Script] 📝 Description (length:', extractedJobData.description?.length || 0, 'chars):');
  console.log(extractedJobData.description || '(empty)');
  console.log('─'.repeat(80));
  console.log('[Content Script] 📋 About The Job Section (length:', extractedJobData.aboutTheJob?.length || 0, 'chars):');
  console.log(extractedJobData.aboutTheJob || '(empty)');
  console.log('─'.repeat(80));
  console.log('[Content Script] 📦 Complete Extracted Data Object:');
  console.log(JSON.stringify(extractedJobData, null, 2));
  console.log('='.repeat(80));
  
  // Also try to print the actual DOM element if we can find it
  try {
    const aboutJobElement = document.querySelector('.show-more-less-html__markup') || 
                            document.querySelector('.jobs-description__text') ||
                            document.querySelector('.jobs-box__html-content');
    if (aboutJobElement) {
      console.log('[Content Script] 🏗️ DOM Element HTML (first 2000 chars):');
      console.log(aboutJobElement.outerHTML.substring(0, 2000) + (aboutJobElement.outerHTML.length > 2000 ? '...' : ''));
      console.log('[Content Script] 🏗️ DOM Element Full HTML Length:', aboutJobElement.outerHTML.length, 'chars');
    }
  } catch (error) {
    console.log('[Content Script] ⚠️ Could not print DOM element:', error);
  }
  console.log('='.repeat(80));
  
  // Check if job already exists
  updateButtonState('loading');
  
  try {
    const checkMessage = {
      action: 'checkJobExists',
      userId,
      jobUrl
    };
    console.log('[Content Script] 📤 Sending checkJobExists message:', checkMessage);
    const checkResponse = await chrome.runtime.sendMessage(checkMessage);
    console.log('[Content Script] 📥 Received checkJobExists response:', checkResponse);
    
    if (checkResponse.success && checkResponse.exists) {
      console.log('[Content Script] ℹ️ Job already exists in database');
      updateButtonState('alreadySent');
      return;
    }
    
    // Analyze and save job - include extracted DOM data as fallback
    const analyzeMessage = {
      action: 'analyzeJob',
      jobUrl,
      userId,
      extractedJobData
    };
    
    // Print full message data before sending
    console.log('='.repeat(80));
    console.log('[Content Script] 📤 ========== MESSAGE TO BE SENT TO BACKGROUND ==========');
    console.log('='.repeat(80));
    console.log('[Content Script] 🔗 Job URL:', analyzeMessage.jobUrl);
    console.log('[Content Script] 👤 User ID:', analyzeMessage.userId);
    console.log('[Content Script] 📋 Action:', analyzeMessage.action);
    console.log('─'.repeat(80));
    console.log('[Content Script] 📦 Extracted Job Data (FULL):');
    console.log('  Title:', analyzeMessage.extractedJobData.title);
    console.log('  Company:', analyzeMessage.extractedJobData.company);
    console.log('  Location:', analyzeMessage.extractedJobData.location);
    console.log('  Employment Type:', analyzeMessage.extractedJobData.employmentType);
    console.log('  Experience Level:', analyzeMessage.extractedJobData.experienceLevel);
    console.log('  Description Length:', analyzeMessage.extractedJobData.description?.length || 0, 'chars');
    console.log('  About The Job Length:', analyzeMessage.extractedJobData.aboutTheJob?.length || 0, 'chars');
    console.log('─'.repeat(80));
    console.log('[Content Script] 📝 Full Description:');
    console.log(analyzeMessage.extractedJobData.description || '(empty)');
    console.log('─'.repeat(80));
    console.log('[Content Script] 📋 Full About The Job:');
    console.log(analyzeMessage.extractedJobData.aboutTheJob || '(empty)');
    console.log('─'.repeat(80));
    console.log('[Content Script] 📦 Complete Message Object (JSON):');
    console.log(JSON.stringify(analyzeMessage, null, 2));
    console.log('='.repeat(80));
    const analyzeResponse = await chrome.runtime.sendMessage(analyzeMessage);
    console.log('[Content Script] 📥 Received analyzeJob response:', analyzeResponse);
    
    if (analyzeResponse.success) {
      console.log('[Content Script] ✅ Job analyzed and saved successfully');
      updateButtonState('success');
    } else {
      console.log('[Content Script] ❌ Job analysis failed:', analyzeResponse.error);
      updateButtonState('error', analyzeResponse.error || 'Failed to analyze job');
    }
  } catch (error) {
    console.error('[Content Script] ❌ Error analyzing job:', error);
    updateButtonState('error', error.message || 'An error occurred');
  }
}

/**
 * Inject button into page
 */
function injectButton() {
  // Don't inject if already injected
  if (buttonState.element && document.contains(buttonState.element)) {
    return;
  }
  
  const jobId = extractJobId();
  if (!jobId) {
    return; // Not a job page with extractable ID
  }
  
  const container = findButtonContainer();
  if (!container) {
    // Retry after a short delay (page might still be loading)
    setTimeout(() => {
      const retryContainer = findButtonContainer();
      if (retryContainer) {
        injectButtonIntoContainer(retryContainer);
      }
    }, 1000);
    return;
  }
  
  injectButtonIntoContainer(container);
}

/**
 * Inject button into specific container
 */
function injectButtonIntoContainer(container) {
  // Remove existing button if present
  const existingButton = container.querySelector('.swiftcareer-send-button');
  if (existingButton) {
    existingButton.remove();
  }
  
  const button = createButton();
  buttonState.element = button;
  buttonState.id = extractJobId();
  
  // Insert button after Easy Apply/Save buttons
  // Try to insert it in a logical position
  const firstButton = container.querySelector('button');
  if (firstButton && firstButton.parentElement) {
    // Create a wrapper div for our button to maintain spacing
    const wrapper = document.createElement('div');
    wrapper.className = 'swiftcareer-button-wrapper';
    wrapper.appendChild(button);
    
    // Insert after the first button's parent or as a sibling
    if (firstButton.nextSibling) {
      firstButton.parentElement.insertBefore(wrapper, firstButton.nextSibling);
    } else {
      firstButton.parentElement.appendChild(wrapper);
    }
  } else {
    // Fallback: append to container
    container.appendChild(button);
  }
  
  // Check if job already exists and update button state
  checkJobStatus();
}

/**
 * Initialize content script
 */
function init() {
  // Inject button when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
  
  // Watch for URL changes (LinkedIn is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Reset button state
      buttonState = {
        id: null,
        element: null,
        status: 'idle'
      };
      // Re-inject after navigation
      setTimeout(() => {
        injectButton();
        // Check job status after injection
        setTimeout(checkJobStatus, 1000);
      }, 500);
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Also watch for button container changes
  new MutationObserver(() => {
    if (!buttonState.element || !document.contains(buttonState.element)) {
      injectButton();
    }
  }).observe(document.body, { subtree: true, childList: true });
}

// Start initialization
init();
