/**
 * Content Generation Utilities
 * Generates CV, Cover Letter, and Interview QA using DeepSeek API
 */

import { Storage } from './storage.js';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// Default DeepSeek API Key (hardcoded)
const DEFAULT_DEEPSEEK_API_KEY = 'sk-80e102cca06342c48c385c5f0247a110';

/**
 * Get DeepSeek API key from storage or use default
 */
async function getDeepSeekApiKey() {
  const apiKey = await Storage.get('DEEPSEEK_API_KEY');
  if (apiKey) {
    return apiKey;
  }
  // Use default key if not configured
  console.log('[Generators] ℹ️ Using default DeepSeek API key');
  return DEFAULT_DEEPSEEK_API_KEY;
}

/**
 * Call DeepSeek API
 */
async function callDeepSeekAPI(messages, temperature = 0.45, responseFormat = null, timeout = 60000) {
  console.log('[Generators] 🤖 Calling DeepSeek API:', {
    messagesCount: messages.length,
    temperature,
    hasResponseFormat: !!responseFormat,
    timeout
  });

  const apiKey = await getDeepSeekApiKey();

  const requestBody = {
    model: DEEPSEEK_MODEL,
    messages: messages,
    temperature: temperature
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Generators] ❌ DeepSeek API error:', errorText);
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('[Generators] ✅ DeepSeek API response received:', {
      contentLength: content.length,
      hasContent: !!content
    });

    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('DeepSeek API request timeout');
    }
    throw error;
  }
}

/**
 * Generate Cover Letter
 * @param {Object} params - Generation parameters
 * @param {Object} params.profile - User profile data
 * @param {string} params.jobTitle - Job title
 * @param {string} params.company - Company name
 * @param {string} params.jobDescription - Job description
 * @param {string} params.jobUrl - Job URL (optional)
 * @param {string} params.instructions - User instructions (optional)
 * @returns {Promise<string>} Generated cover letter text
 */
export async function generateCoverLetter({
  profile,
  jobTitle,
  company,
  jobDescription,
  jobUrl = null,
  instructions = null
}) {
  console.log('[Generators] 📝 Generating cover letter:', {
    jobTitle,
    company,
    hasInstructions: !!instructions,
    descriptionLength: jobDescription?.length || 0
  });

  const systemPrompt = `You are an expert cover letter writer for job applications.

Write a tailored cover letter using ONLY the provided candidate profile and job context. Do not fabricate employers, degrees, or achievements.

Output rules:
- Output plain text only (no markdown, no JSON).
- 180-320 words unless the user instructions specify otherwise.
- Use the SAME language as the user instructions when present; otherwise match the job description language.
- Structure: Greeting, 2-3 short paragraphs, closing, signature with the candidate name.
- Be specific and quantify impact when possible, but do not invent numbers.`;

  // Clip long text fields
  const summary = profile.summary ? profile.summary.substring(0, 1200) : '';
  const description = jobDescription ? jobDescription.substring(0, 2500) : '';
  const userInstructions = instructions ? instructions.substring(0, 800) : 'None';

  const userPrompt = `Candidate profile:
Name: ${profile.fullName || ''}
Email: ${profile.email || ''}
Headline: ${profile.headline || ''}
Location: ${profile.location || ''}
LinkedIn: ${profile.linkedin || 'N/A'}
Summary: ${summary}
Skills: ${(profile.skills || []).join(', ')}

Job:
Title: ${jobTitle}
Company: ${company}
Job URL: ${jobUrl || 'N/A'}
Job description:
${description}

User instructions (optional):
${userInstructions}

Write the cover letter now.`;

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.45, // temperature
      null, // no response format (plain text)
      60000 // 60 seconds timeout
    );

    const coverLetter = content.trim();
    console.log('[Generators] ✅ Cover letter generated:', {
      length: coverLetter.length,
      wordCount: coverLetter.split(/\s+/).length
    });

    return coverLetter;
  } catch (error) {
    console.error('[Generators] ❌ Error generating cover letter:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback cover letter');
    return `Dear Hiring Manager,

I am writing to express my interest in the ${jobTitle} position at ${company}. Based on the job description, I believe my skills and experience align well with your requirements.

I look forward to the opportunity to discuss how my background can contribute to your team.

Best regards,
${profile.fullName || 'Candidate'}`;
  }
}

/**
 * Generate Interview QA
 * @param {Object} params - Generation parameters
 * @param {Object} params.profile - User profile data
 * @param {string} params.jobTitle - Job title
 * @param {string} params.company - Company name
 * @param {string} params.jobDescription - Job description
 * @param {Array<string>} params.jobRequirements - Job skills/requirements
 * @param {string} params.experienceLevel - Experience level (optional)
 * @param {number} params.batchIndex - Batch index (1-5)
 * @returns {Promise<Array>} Array of {q, a} objects
 */
export async function generateInterviewQA({
  profile,
  jobTitle,
  company,
  jobDescription,
  jobRequirements = [],
  experienceLevel = null,
  batchIndex = 1
}) {
  console.log('[Generators] ❓ Generating interview QA batch:', {
    batchIndex,
    jobTitle,
    company,
    requirementsCount: jobRequirements.length
  });

  const batchFocuses = {
    1: 'Focus on role-specific TECHNICAL questions about skills, tools, and technologies mentioned in the job.',
    2: 'Focus on BEHAVIORAL questions using STAR method (Tell me about a time when...).',
    3: 'Focus on PROBLEM-SOLVING and SCENARIO-based questions (What would you do if..., How would you handle...).',
    4: 'Focus on MOTIVATION and CULTURE FIT questions (Why this company, career goals, work style).'
  };

  const batchFocus = batchFocuses[batchIndex] || 
    `Focus on ADVANCED and EDGE-CASE questions that test deeper expertise and critical thinking. Batch #${batchIndex}.`;

  const systemPrompt = `You are an interview coach. Output the result as a JSON object only. The object must include an array "items" of exactly 5 elements and nothing else. Each element has: {"q": string, "a": string}. Keep answers concise (2-4 sentences), practical, and tailored to the role.

IMPORTANT - This is batch #${batchIndex}: ${batchFocus}

Generate questions that are DIFFERENT from typical generic questions. Make them specific to the job requirements and responsibilities mentioned.`;

  // Clip job description
  const description = jobDescription ? jobDescription.substring(0, 2000) : '';

  const userPrompt = `Profile: ${profile.fullName || ''} | ${profile.headline || ''} | Skills: ${(profile.skills || []).join(', ')} | Location: ${profile.location || ''}

Role: "${jobTitle}" at "${company}"

${experienceLevel ? `Experience Level: ${experienceLevel}` : ''}

${description ? `Job Description: ${description}` : ''}

${jobRequirements && jobRequirements.length > 0 ? `Required Skills/Technologies: ${jobRequirements.join(', ')}` : ''}

Generate 5 expected interview questions and concise answers. Return JSON with {"items":[{"q":"...","a":"..."}, ...]}.`;

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      45000 // 45 seconds timeout
    );

    const parsed = JSON.parse(content);
    const items = parsed.items || [];

    if (items.length !== 5) {
      console.warn('[Generators] ⚠️ Expected 5 items, got:', items.length);
    }

    console.log('[Generators] ✅ Interview QA generated:', {
      batchIndex,
      itemsCount: items.length
    });

    return items;
  } catch (error) {
    console.error('[Generators] ❌ Error generating interview QA:', error);
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    console.warn('[Generators] ⚠️ Returning fallback interview QA');
    return [
      { q: `Why are you interested in the ${jobTitle} position at ${company}?`, a: 'I am interested in this role because it aligns with my career goals and allows me to contribute my skills to your team.' },
      { q: 'What relevant experience do you have?', a: 'I have experience in the required skills and technologies mentioned in the job description.' },
      { q: 'How do you handle challenges?', a: 'I approach challenges systematically, breaking them down into manageable steps and seeking solutions collaboratively.' },
      { q: 'What are your strengths?', a: 'My strengths include problem-solving, attention to detail, and the ability to work effectively in a team environment.' },
      { q: 'Where do you see yourself in 5 years?', a: 'I see myself growing within the company, taking on more responsibilities, and contributing to the team\'s success.' }
    ];
  }
}

/**
 * Generate Tailored CV
 * @param {Object} params - Generation parameters
 * @param {Object} params.cvData - Complete CV data (user profile + experiences + projects + etc.)
 * @param {Object} params.jobData - Job information
 * @param {Array<string>} params.jobSkills - Job skills
 * @param {string} params.userInstructions - User instructions (optional)
 * @param {string} params.focusLabel - Focus keywords (optional)
 * @returns {Promise<Object>} Tailored CV data with report
 */
export async function generateTailoredCV({
  cvData,
  jobData,
  jobSkills,
  userInstructions = null,
  focusLabel = null
}) {
  console.log('[Generators] 📄 Generating tailored CV:', {
    jobTitle: jobData.title,
    company: jobData.company,
    jobSkillsCount: jobSkills.length,
    hasInstructions: !!userInstructions,
    hasFocusLabel: !!focusLabel,
    cvDataSummary: cvData.user?.summary?.substring(0, 100) || 'N/A',
    workExperiencesCount: cvData.workExperiences?.length || 0,
    projectsCount: cvData.projects?.length || 0
  });

  const systemPrompt = `You are a professional CV tailoring expert. Your PRIMARY GOAL is to MAXIMIZE the job match percentage by making AGGRESSIVE, SIGNIFICANT improvements.

CRITICAL RULES:
1. NEVER add information that is not present in the original CV data
2. ONLY rephrase, prioritize, and select from existing information
3. Use synonyms and keywords from the job description intelligently
4. Focus on aspects most relevant to the job requirements

Return ONLY valid JSON with this structure:
{
  "summary": "Rephrased professional summary (2-4 sentences)",
  "focus_summary": "Short label (1-3 words) or null",
  "skills": ["Prioritized", "list", "of", "skills"],
  "highlights": [
    {
      "text": "Rephrased achievement 1",
      "source": "experience|project",
      "index": 0
    }
  ],
  "experiences": [
    {
      "index": 0,
      "description": "Enhanced description focusing on relevant aspects"
    }
  ]
}`;

  // Build comprehensive user prompt
  const userPrompt = buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel);
  
  console.log('[Generators] 📤 Sending request to DeepSeek API...');
  console.log('[Generators] 📋 Prompt length:', userPrompt.length, 'characters');
  console.log('[Generators] 📋 Prompt preview (first 500 chars):', userPrompt.substring(0, 500));

  try {
    const content = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      0.55, // temperature
      { type: 'json_object' }, // JSON response format
      90000 // 90 seconds timeout
    );

    console.log('[Generators] 📥 Received response from DeepSeek API');
    console.log('[Generators] 📥 Response length:', content.length, 'characters');
    console.log('[Generators] 📥 Response preview (first 500 chars):', content.substring(0, 500));

    // Parse JSON with detailed error handling
    let tailoredPatch;
    try {
      // Try to extract JSON if wrapped in markdown code blocks
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonContent = jsonMatch[1].trim();
          console.log('[Generators] 🔧 Extracted JSON from markdown code block');
        }
      }
      
      tailoredPatch = JSON.parse(jsonContent);
      console.log('[Generators] ✅ JSON parsed successfully');
    } catch (parseError) {
      console.error('[Generators] ❌ JSON parsing failed:', parseError);
      console.error('[Generators] ❌ Raw response:', content);
      console.error('[Generators] ❌ Parse error details:', {
        message: parseError.message,
        name: parseError.name
      });
      // Don't throw - use fallback strategy instead
      console.warn('[Generators] ⚠️ Using fallback strategy due to JSON parse error');
      tailoredPatch = null;
    }

    // Validate and build validated patch with smart fallback
    console.log('[Generators] 🔍 Validating parsed data...');
    
    if (!tailoredPatch || typeof tailoredPatch !== 'object') {
      console.warn('[Generators] ⚠️ Invalid tailoredPatch, using fallback');
      tailoredPatch = {};
    }
    
    console.log('[Generators] 🔍 Parsed data keys:', Object.keys(tailoredPatch || {}));
    console.log('[Generators] 🔍 Has summary:', !!tailoredPatch?.summary, 'Length:', tailoredPatch?.summary?.length || 0);
    console.log('[Generators] 🔍 Has focus_summary:', !!tailoredPatch?.focus_summary);
    console.log('[Generators] 🔍 Skills:', tailoredPatch?.skills?.length || 0, 'items');
    console.log('[Generators] 🔍 Highlights:', tailoredPatch?.highlights?.length || 0, 'items');
    console.log('[Generators] 🔍 Experiences:', tailoredPatch?.experiences?.length || 0, 'items');

    // Smart fallback strategy: merge API response with original data
    // Priority: API response > Original CV data > Empty defaults (but never completely empty)
    const originalSummary = cvData.user?.summary || '';
    const originalSkills = cvData.user?.skills || [];
    const originalExperiences = cvData.workExperiences || [];
    
    // Build validated patch with intelligent fallback
    let validatedSummary = '';
    if (tailoredPatch.summary && typeof tailoredPatch.summary === 'string' && tailoredPatch.summary.trim().length > 0) {
      validatedSummary = tailoredPatch.summary.trim();
      console.log('[Generators] ✅ Using API summary (length:', validatedSummary.length, ')');
    } else if (originalSummary && originalSummary.trim().length > 0) {
      validatedSummary = originalSummary.trim();
      console.log('[Generators] ⚠️ API summary empty, using original summary (length:', validatedSummary.length, ')');
    } else {
      // Last resort: create a basic summary from available data
      const skillsText = originalSkills.length > 0 ? originalSkills.slice(0, 5).join(', ') : 'various skills';
      const expText = originalExperiences.length > 0 ? `${originalExperiences.length} years of experience` : 'professional experience';
      validatedSummary = `Experienced professional with ${expText} in ${skillsText}.`;
      console.log('[Generators] ⚠️ No summary available, created fallback summary');
    }

    let validatedSkills = [];
    if (Array.isArray(tailoredPatch.skills) && tailoredPatch.skills.length > 0) {
      validatedSkills = tailoredPatch.skills.filter(s => s && typeof s === 'string' && s.trim().length > 0);
      console.log('[Generators] ✅ Using API skills (count:', validatedSkills.length, ')');
    }
    if (validatedSkills.length === 0 && originalSkills.length > 0) {
      validatedSkills = [...originalSkills];
      console.log('[Generators] ⚠️ API skills empty, using original skills (count:', validatedSkills.length, ')');
    }

    let validatedHighlights = [];
    if (Array.isArray(tailoredPatch.highlights) && tailoredPatch.highlights.length > 0) {
      validatedHighlights = tailoredPatch.highlights.filter(h => 
        h && typeof h === 'object' && 
        h.text && typeof h.text === 'string' && h.text.trim().length > 0
      );
      console.log('[Generators] ✅ Using API highlights (count:', validatedHighlights.length, ')');
    }
    // If highlights are empty but we have experiences, create highlights from experiences
    if (validatedHighlights.length === 0 && originalExperiences.length > 0) {
      validatedHighlights = originalExperiences
        .slice(0, 5)
        .filter(exp => exp.description && exp.description.trim().length > 0)
        .map((exp, idx) => ({
          text: exp.description.substring(0, 150) + (exp.description.length > 150 ? '...' : ''),
          source: 'experience',
          index: idx
        }));
      console.log('[Generators] ⚠️ API highlights empty, created from experiences (count:', validatedHighlights.length, ')');
    }

    let validatedExperiences = [];
    if (Array.isArray(tailoredPatch.experiences) && tailoredPatch.experiences.length > 0) {
      validatedExperiences = tailoredPatch.experiences.filter(exp => 
        exp && typeof exp === 'object' && 
        typeof exp.index === 'number' &&
        exp.description && typeof exp.description === 'string' && exp.description.trim().length > 0
      );
      console.log('[Generators] ✅ Using API experiences (count:', validatedExperiences.length, ')');
    }
    // If experiences are empty but we have original experiences, use them
    if (validatedExperiences.length === 0 && originalExperiences.length > 0) {
      validatedExperiences = originalExperiences.map((exp, idx) => ({
        index: idx,
        description: exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`
      }));
      console.log('[Generators] ⚠️ API experiences empty, using original experiences (count:', validatedExperiences.length, ')');
    }

    const validatedPatch = {
      summary: validatedSummary,
      focus_summary: tailoredPatch.focus_summary || null,
      skills: validatedSkills,
      highlights: validatedHighlights,
      experiences: validatedExperiences
    };

    // Final validation: ensure we never return completely empty data
    if (!validatedPatch.summary || validatedPatch.summary.trim().length === 0) {
      console.error('[Generators] ❌ CRITICAL: Summary is still empty after all fallbacks!');
      validatedPatch.summary = 'Professional with relevant experience and skills.';
    }
    if (validatedPatch.skills.length === 0) {
      console.error('[Generators] ❌ CRITICAL: Skills array is still empty after all fallbacks!');
      validatedPatch.skills = ['Professional Skills'];
    }

    console.log('[Generators] ✅ Tailored CV generated and validated:', {
      hasSummary: !!validatedPatch.summary,
      summaryLength: validatedPatch.summary.length,
      hasFocusSummary: !!validatedPatch.focus_summary,
      skillsCount: validatedPatch.skills.length,
      highlightsCount: validatedPatch.highlights.length,
      experiencesCount: validatedPatch.experiences.length,
      summaryPreview: validatedPatch.summary.substring(0, 100) + (validatedPatch.summary.length > 100 ? '...' : '')
    });

    // Log full data structure for debugging
    console.log('[Generators] 📊 Full tailored patch structure:', JSON.stringify(validatedPatch, null, 2));

    return validatedPatch;
  } catch (error) {
    console.error('[Generators] ❌ Error generating tailored CV:', error);
    console.error('[Generators] ❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return fallback stub content instead of throwing
    if (error.message && error.message.includes('API key not configured')) {
      throw error; // Re-throw configuration errors
    }
    
    console.warn('[Generators] ⚠️ Returning fallback CV data due to error');
    
    // Build comprehensive fallback using original CV data
    const originalSummary = cvData.user?.summary || '';
    const originalSkills = cvData.user?.skills || [];
    const originalExperiences = cvData.workExperiences || [];
    
    // Ensure summary is never empty
    let fallbackSummary = originalSummary;
    if (!fallbackSummary || fallbackSummary.trim().length === 0) {
      const skillsText = originalSkills.length > 0 ? originalSkills.slice(0, 5).join(', ') : 'various skills';
      const expText = originalExperiences.length > 0 ? `${originalExperiences.length} years of experience` : 'professional experience';
      fallbackSummary = `Experienced professional with ${expText} in ${skillsText}.`;
      console.log('[Generators] ⚠️ Created fallback summary from available data');
    }
    
    // Ensure skills is never empty
    let fallbackSkills = originalSkills.length > 0 ? [...originalSkills] : ['Professional Skills'];
    
    // Create highlights from experiences if available
    let fallbackHighlights = [];
    if (originalExperiences.length > 0) {
      fallbackHighlights = originalExperiences
        .slice(0, 5)
        .filter(exp => exp.description && exp.description.trim().length > 0)
        .map((exp, idx) => ({
          text: exp.description.substring(0, 150) + (exp.description.length > 150 ? '...' : ''),
          source: 'experience',
          index: idx
        }));
    }
    
    // Create experiences array from original work experiences
    let fallbackExperiences = [];
    if (originalExperiences.length > 0) {
      fallbackExperiences = originalExperiences.map((exp, idx) => ({
        index: idx,
        description: exp.description || `${exp.position || 'Position'} at ${exp.company || 'Company'}`
      }));
    }
    
    const fallbackData = {
      summary: fallbackSummary,
      focus_summary: null,
      skills: fallbackSkills,
      highlights: fallbackHighlights,
      experiences: fallbackExperiences
    };
    
    console.log('[Generators] ⚠️ Fallback data:', {
      hasSummary: !!fallbackData.summary,
      summaryLength: fallbackData.summary.length,
      skillsCount: fallbackData.skills.length,
      highlightsCount: fallbackData.highlights.length,
      experiencesCount: fallbackData.experiences.length
    });
    
    return fallbackData;
  }
}

/**
 * Build comprehensive CV tailoring prompt
 */
function buildCVTailoringPrompt(cvData, jobData, userInstructions, focusLabel) {
  let prompt = `Job Information:
Title: ${jobData.title || ''}
Company: ${jobData.company || ''}
Location: ${jobData.location || ''}
Experience Level: ${jobData.experienceLevel || ''}
Employment Type: ${jobData.employmentType || ''}

Job Description:
${jobData.description || ''}

Required Skills: ${(jobData.skills || []).join(', ')}

`;

  if (userInstructions) {
    prompt += `User Instructions:
${userInstructions.substring(0, 800)}

`;
  }

  if (focusLabel) {
    prompt += `Focus Keywords: ${focusLabel}

`;
  }

  prompt += `Candidate CV Data:

User Profile:
Name: ${cvData.user?.fullName || ''}
Headline: ${cvData.user?.headline || ''}
Summary: ${cvData.user?.summary || ''}
Skills: ${(cvData.user?.skills || []).join(', ')}
Location: ${cvData.user?.location || ''}
Email: ${cvData.user?.email || ''}
LinkedIn: ${cvData.user?.linkedin || ''}

`;

  // Enhanced work experiences with more detail
  if (cvData.workExperiences && cvData.workExperiences.length > 0) {
    prompt += `Work Experiences (${cvData.workExperiences.length} positions):\n`;
    cvData.workExperiences.forEach((exp, index) => {
      prompt += `${index}. Position: ${exp.position || 'N/A'}\n`;
      prompt += `   Company: ${exp.company || 'N/A'}\n`;
      prompt += `   Period: ${exp.startDate || 'N/A'} - ${exp.endDate || exp.current ? 'Present' : 'N/A'}\n`;
      prompt += `   Description: ${exp.description || 'No description provided'}\n`;
      if (exp.description && exp.description.trim().length === 0) {
        prompt += `   ⚠️ WARNING: This experience has no description. Use the position and company name to create relevant achievements.\n`;
      }
      prompt += `\n`;
    });
  } else {
    prompt += `Work Experiences: None provided\n\n`;
  }

  // Enhanced projects with more detail
  if (cvData.projects && cvData.projects.length > 0) {
    prompt += `Projects (${cvData.projects.length} projects):\n`;
    cvData.projects.forEach((project, index) => {
      prompt += `${index}. Project Name: ${project.name || 'N/A'}\n`;
      prompt += `   Description: ${project.description || 'No description provided'}\n`;
      prompt += `   Technologies: ${(project.technologies || []).join(', ') || 'None specified'}\n`;
      if (project.url) {
        prompt += `   URL: ${project.url}\n`;
      }
      if (project.startDate || project.endDate) {
        prompt += `   Period: ${project.startDate || 'N/A'} - ${project.endDate || 'N/A'}\n`;
      }
      prompt += `\n`;
    });
  } else {
    prompt += `Projects: None provided\n\n`;
  }

  // Enhanced education
  if (cvData.educations && cvData.educations.length > 0) {
    prompt += `Education (${cvData.educations.length} entries):\n`;
    cvData.educations.forEach((edu, index) => {
      prompt += `${index}. Degree: ${edu.degree || 'N/A'}\n`;
      prompt += `   Field: ${edu.field || 'N/A'}\n`;
      prompt += `   Institution: ${edu.institution || 'N/A'}\n`;
      if (edu.startDate || edu.endDate) {
        prompt += `   Period: ${edu.startDate || 'N/A'} - ${edu.endDate || 'N/A'}\n`;
      }
      if (edu.gpa) {
        prompt += `   GPA: ${edu.gpa}\n`;
      }
      prompt += `\n`;
    });
  }

  // Add certifications if available
  if (cvData.certifications && cvData.certifications.length > 0) {
    prompt += `Certifications (${cvData.certifications.length} certifications):\n`;
    cvData.certifications.forEach((cert, index) => {
      prompt += `${index}. ${cert.name || 'N/A'} from ${cert.issuer || 'N/A'}\n`;
      if (cert.issueDate) {
        prompt += `   Issued: ${cert.issueDate}\n`;
      }
      prompt += `\n`;
    });
  }

  // Add awards if available
  if (cvData.awards && cvData.awards.length > 0) {
    prompt += `Awards (${cvData.awards.length} awards):\n`;
    cvData.awards.forEach((award, index) => {
      prompt += `${index}. ${award.title || 'N/A'}\n`;
      if (award.issuer) {
        prompt += `   Issuer: ${award.issuer}\n`;
      }
      if (award.description) {
        prompt += `   Description: ${award.description}\n`;
      }
      prompt += `\n`;
    });
  }

  // Add example output structure to help AI understand
  prompt += `\nIMPORTANT: You must return a JSON object with this EXACT structure:
{
  "summary": "A rephrased professional summary (2-4 sentences) that highlights the candidate's most relevant experience and skills for this specific job. MUST be non-empty.",
  "focus_summary": "A short label (1-3 words) that captures the focus area, or null if not applicable",
  "skills": ["Prioritized", "list", "of", "skills", "from", "the", "candidate's", "profile", "that", "match", "the", "job", "requirements"],
  "highlights": [
    {
      "text": "A rephrased achievement or highlight from work experiences or projects that is relevant to the job",
      "source": "experience",
      "index": 0
    }
  ],
  "experiences": [
    {
      "index": 0,
      "description": "An enhanced description for this work experience focusing on aspects most relevant to the job"
    }
  ]
}

CRITICAL REQUIREMENTS:
1. The "summary" field MUST be non-empty. If the original summary is empty, create one based on work experiences and skills.
2. The "skills" array MUST contain at least some skills from the candidate's profile, prioritized by job relevance.
3. The "highlights" array should contain 3-8 relevant achievements from work experiences or projects.
4. The "experiences" array should have one entry per work experience, with enhanced descriptions.
5. NEVER add information that is not present in the CV data above.
6. Use synonyms and keywords from the job description intelligently.
7. Focus on aspects most relevant to the job requirements.

Now tailor this CV to maximize job match. Return ONLY the JSON object, no other text.`;

  return prompt;
}
