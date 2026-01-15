/**
 * Popup Script
 * Handles authentication UI and logic
 */

import { signIn, signUp, signOut, getCurrentUser, isAuthenticated } from '../utils/supabase.js';
import { Storage } from '../utils/storage.js';

// DOM Elements
const authForm = document.getElementById('authForm');
const authStatus = document.getElementById('authStatus');
const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');
const signOutBtn = document.getElementById('signOutBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const loadingState = document.getElementById('loadingState');
const userEmail = document.getElementById('userEmail');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const optionsLink = document.getElementById('optionsLink');

// Initialize popup
async function init() {
  // Supabase is pre-configured, no need to check
  // Check authentication status
  await checkAuthStatus();

  // Setup event listeners
  setupEventListeners();
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
  }
}

// Show authentication form
function showAuthForm() {
  authForm.classList.remove('hidden');
  authStatus.classList.add('hidden');
  clearMessages();
}

// Show authenticated status
function showAuthStatus(user) {
  authForm.classList.add('hidden');
  authStatus.classList.remove('hidden');
  userEmail.textContent = user.email;
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      switchTab(targetTab);
    });
  });

  // Sign in form
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSignIn();
  });

  // Sign up form
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSignUp();
  });

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

// Switch tabs
function switchTab(tabName) {
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  tabContents.forEach(content => {
    if (content.id === `${tabName}Tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  clearMessages();
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

// Handle sign up
async function handleSignUp() {
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;

  if (!email || !password) {
    showError('Please enter email and password');
    return;
  }

  if (password.length < 6) {
    showError('Password must be at least 6 characters');
    return;
  }

  showLoading(true);
  clearMessages();

  try {
    await signUp(email, password);
    showSuccess('Account created! Please check your email to verify your account.');
    // Switch to sign in tab
    setTimeout(() => {
      switchTab('signin');
      document.getElementById('signinEmail').value = email;
    }, 2000);
  } catch (error) {
    showError(error.message || 'Sign up failed. Please try again.');
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
    signupForm.reset();
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

// Initialize on load
init();
