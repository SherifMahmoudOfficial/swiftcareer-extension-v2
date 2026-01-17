/**
 * Popup Script
 * Handles authentication UI and logic
 */

import { signIn, signOut, getCurrentUser, isAuthenticated } from '../utils/supabase.js';
import { Storage } from '../utils/storage.js';
import { getBalance } from '../utils/credits_service.js';

// DOM Elements
const authForm = document.getElementById('authForm');
const authStatus = document.getElementById('authStatus');
const signinForm = document.getElementById('signinForm');
const signOutBtn = document.getElementById('signOutBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const loadingState = document.getElementById('loadingState');
const userEmail = document.getElementById('userEmail');
const optionsLink = document.getElementById('optionsLink');
const creditsBalance = document.getElementById('creditsBalance');
const creditsWarning = document.getElementById('creditsWarning');
const togglePasswordBtn = document.getElementById('togglePassword');
const signinPasswordInput = document.getElementById('signinPassword');

// Jobs status elements
const jobsStatus = document.getElementById('jobsStatus');
const jobsStatusCount = document.getElementById('jobsStatusCount');
const jobsStatusEmpty = document.getElementById('jobsStatusEmpty');
const jobsStatusList = document.getElementById('jobsStatusList');

let jobsPollingTimer = null;
let currentUserIdForPolling = null;

const stepLabels = {
  queued: 'Queued',
  starting: 'Starting',
  fetching_profile: 'Fetching profile',
  analyzing_job: 'Analyzing job',
  creating_chat: 'Creating chat',
  generating_content: 'Generating content',
  generating_cover_letter: 'Generating cover letter',
  generating_cv: 'Generating CV',
  generating_interview_qa: 'Generating Interview Q&A',
  generating_portfolio: 'Generating portfolio',
  completed: 'Completed',
  failed: 'Failed'
};

// Initialize popup
async function init() {
  // Start with loading state to avoid login form flash while checking session
  showLoading(true);

  // Supabase is pre-configured, no need to check
  // Check authentication status
  await checkAuthStatus();

  // Setup event listeners
  setupEventListeners();
  
  // Refresh credits when popup gains focus (user switches back to it)
  window.addEventListener('focus', async () => {
    try {
      const authenticated = await isAuthenticated();
      if (authenticated) {
        const user = await getCurrentUser();
        if (user) {
          await loadCreditsBalance(user.id);
        }
      }
    } catch (error) {
      console.error('Error refreshing credits on focus:', error);
    }
  });

  // Listen for credits update messages from background/content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'creditsUpdated') {
      console.log('[Popup] Credits updated message received');
      // Refresh credits balance
      getCurrentUser().then(user => {
        if (user) {
          loadCreditsBalance(user.id);
        }
      }).catch(err => {
        console.error('[Popup] Error refreshing credits:', err);
      });
    }

    if (message.action === 'jobStatusChanged') {
      if (currentUserIdForPolling && message.userId === currentUserIdForPolling) {
        fetchAndRenderPendingJobs(currentUserIdForPolling).catch(() => {});
      }
    }
  });
}

// Check authentication status
async function checkAuthStatus() {
  try {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      const user = await getCurrentUser();
      showAuthStatus(user);
    } else {
      showAuthForm();
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showAuthForm();
  } finally {
    showLoading(false);
  }
}

// Show authentication form
function showAuthForm() {
  authForm.classList.remove('hidden');
  authStatus.classList.add('hidden');
  stopJobsPolling();
  clearMessages();
}

// Show authenticated status
async function showAuthStatus(user) {
  authForm.classList.add('hidden');
  authStatus.classList.remove('hidden');
  userEmail.textContent = user.email;
  
  // Load and display credits balance
  loadCreditsBalance(user.id).catch((err) => {
    console.error('Error loading credits balance:', err);
  });

  startJobsPolling(user.id);
}

function stopJobsPolling() {
  if (jobsPollingTimer) {
    clearInterval(jobsPollingTimer);
    jobsPollingTimer = null;
  }
  currentUserIdForPolling = null;
}

function startJobsPolling(userId) {
  stopJobsPolling();
  currentUserIdForPolling = userId;
  if (!jobsStatus || !jobsStatusList || !jobsStatusEmpty) return;

  fetchAndRenderPendingJobs(userId).catch(() => {});
  jobsPollingTimer = setInterval(() => {
    fetchAndRenderPendingJobs(userId).catch(() => {});
  }, 1000);
}

async function fetchAndRenderPendingJobs(userId) {
  if (!jobsStatus || !jobsStatusList || !jobsStatusEmpty) return;
  const resp = await chrome.runtime.sendMessage({ action: 'getPendingJobs', userId });
  if (!resp || !resp.success) return;
  renderPendingJobs(resp.jobs || []);
}

function renderPendingJobs(jobs) {
  if (!jobsStatusList || !jobsStatusEmpty || !jobsStatusCount) return;
  const visible = Array.isArray(jobs) ? jobs : [];

  jobsStatusCount.textContent = visible.length > 0 ? String(visible.length) : '';
  jobsStatusList.innerHTML = '';

  if (visible.length === 0) {
    jobsStatusEmpty.classList.remove('hidden');
    return;
  }
  jobsStatusEmpty.classList.add('hidden');

  for (const job of visible) {
    const title = String(job.title || 'Job').trim();
    const company = String(job.company || '').trim();
    const primary = company ? `${title} • ${company}` : title;

    const status = String(job.status || '').toUpperCase();
    const step = stepLabels[job.currentStep] || job.currentStep || '';
    const queueInfo = job.queuePosition ? `#${job.queuePosition}` : '';
    const stepLine = [queueInfo, step].filter(Boolean).join(' • ');

    const item = document.createElement('div');
    item.className = 'job-item';
    item.innerHTML = `
      <div class="job-item-top">
        <div class="job-item-title" title="${escapeHtml(primary)}">${escapeHtml(primary)}</div>
        <div class="job-item-status">${escapeHtml(status)}</div>
      </div>
      <div class="job-item-step">${escapeHtml(stepLine)}</div>
      ${job.error ? `<div class="job-item-error">${escapeHtml(job.error)}</div>` : ''}
    `;
    jobsStatusList.appendChild(item);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Setup event listeners
function setupEventListeners() {
  // Sign in form
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSignIn();
  });

  // Toggle password visibility
  if (togglePasswordBtn && signinPasswordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = signinPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      signinPasswordInput.setAttribute('type', type);
      
      // Update icon (eye/eye-slash)
      const svg = togglePasswordBtn.querySelector('svg');
      if (type === 'text') {
        // Show eye-slash icon
        svg.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19l-3.42-3.42a3 3 0 0 0-4.24-4.24L9.9 4.24z"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        // Show eye icon
        svg.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }

  // Forgot password link
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      // TODO: Implement forgot password functionality
      showError('Forgot password functionality coming soon');
    });
  }

  // Sign out button
  signOutBtn.addEventListener('click', async () => {
    await handleSignOut();
  });

  // Options link
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}


// Handle sign in
async function handleSignIn() {
  const email = document.getElementById('signinEmail').value;
  const password = document.getElementById('signinPassword').value;

  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }

  showLoading(true);
  clearMessages();

  try {
    await signIn(email, password);
    const user = await getCurrentUser();
    showAuthStatus(user);
    showSuccess('Signed in successfully!');
  } catch (error) {
    showError(error.message || 'Sign in failed. Please check your credentials.');
  } finally {
    showLoading(false);
  }
}


// Handle sign out
async function handleSignOut() {
  showLoading(true);

  try {
    await signOut();
    showAuthForm();
    // Clear form fields
    signinForm.reset();
    // Reset password visibility
    if (signinPasswordInput) {
      signinPasswordInput.setAttribute('type', 'password');
      const svg = togglePasswordBtn?.querySelector('svg');
      if (svg) {
        svg.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    }
    clearMessages();
  } catch (error) {
    showError(error.message || 'Sign out failed');
  } finally {
    showLoading(false);
  }
}

// Show loading state
function showLoading(show) {
  if (show) {
    loadingState.classList.remove('hidden');
    authForm.classList.add('hidden');
    authStatus.classList.add('hidden');
  } else {
    loadingState.classList.add('hidden');
  }
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  successMessage.classList.add('hidden');
}

// Show success message
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.classList.remove('hidden');
  errorMessage.classList.add('hidden');
}

// Clear messages
function clearMessages() {
  errorMessage.classList.add('hidden');
  successMessage.classList.add('hidden');
  errorMessage.textContent = '';
  successMessage.textContent = '';
}

// Show options link
function showOptionsLink() {
  optionsLink.style.display = 'block';
}

// Load and display credits balance
async function loadCreditsBalance(userId) {
  try {
    creditsBalance.textContent = 'Loading...';
    const balance = await getBalance(userId);
    creditsBalance.textContent = balance.toLocaleString();
    
    // Show warning if credits are low (less than 10)
    if (balance < 10) {
      creditsWarning.classList.remove('hidden');
    } else {
      creditsWarning.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error loading credits balance:', error);
    creditsBalance.textContent = 'Error';
    creditsWarning.classList.add('hidden');
  }
}

// Initialize on load
init();
