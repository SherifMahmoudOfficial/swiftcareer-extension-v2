/**
 * Options Page Script
 * Handles Supabase configuration and authentication status
 */

import { Storage } from '../utils/storage.js';
import { initSupabase, isAuthenticated, getCurrentUser, signOut } from '../utils/supabase.js';

// DOM Elements
const configForm = document.getElementById('configForm');
const supabaseUrlInput = document.getElementById('supabaseUrl');
const supabaseAnonKeyInput = document.getElementById('supabaseAnonKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const testConnectionBtn = document.getElementById('testConnection');
const messageDiv = document.getElementById('message');
const authStatusText = document.getElementById('authStatusText');
const authUserEmail = document.getElementById('authUserEmail');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');

// DeepSeek API Elements
const deepseekForm = document.getElementById('deepseekForm');
const deepseekApiKeyInput = document.getElementById('deepseekApiKey');
const toggleDeepSeekKeyBtn = document.getElementById('toggleDeepSeekKey');
const deepseekMessageDiv = document.getElementById('deepseekMessage');

// Initialize options page
async function init() {
  // Load saved configuration
  await loadConfiguration();

  // Load DeepSeek configuration
  await loadDeepSeekConfiguration();

  // Check authentication status
  await checkAuthStatus();

  // Setup event listeners
  setupEventListeners();
}

// Load saved configuration
async function loadConfiguration() {
  const config = await Storage.getMultiple(['supabaseUrl', 'supabaseAnonKey']);
  
  // Default values (hardcoded)
  const defaultUrl = 'https://xqztrdozodptapqlnyoj.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenRyZG96b2RwdGFwcWxueW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MDg4OTUsImV4cCI6MjA4MDA4NDg5NX0.bEfbybiz-ncXoCK_DxvjKSLioFVVO3UoG4ztMMYf64o';
  
  // Show saved config or defaults
  supabaseUrlInput.value = config.supabaseUrl || defaultUrl;
  supabaseAnonKeyInput.value = config.supabaseAnonKey || defaultKey;
  
  // Add note about defaults
  const note = document.createElement('p');
  note.style.cssText = 'margin-top: 10px; padding: 10px; background: #f0f9f4; border-radius: 4px; font-size: 12px; color: #057642;';
  note.textContent = 'ℹ️ Default Supabase configuration is pre-configured. You can override it if needed.';
  supabaseUrlInput.parentElement.appendChild(note);
}

// Setup event listeners
function setupEventListeners() {
  // Save configuration
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveConfiguration();
  });

  // Test connection
  testConnectionBtn.addEventListener('click', async () => {
    await testConnection();
  });

  // Toggle key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const type = supabaseAnonKeyInput.type === 'password' ? 'text' : 'password';
    supabaseAnonKeyInput.type = type;
  });

  // DeepSeek form submit
  deepseekForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveDeepSeekConfiguration();
  });

  // Toggle DeepSeek key visibility
  toggleDeepSeekKeyBtn.addEventListener('click', () => {
    const type = deepseekApiKeyInput.type === 'password' ? 'text' : 'password';
    deepseekApiKeyInput.type = type;
  });

  // Sign in button
  signInBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    // Open popup for sign in
    window.close();
    chrome.action.openPopup();
  });

  // Sign out button
  signOutBtn.addEventListener('click', async () => {
    await handleSignOut();
  });
}

// Save configuration
async function saveConfiguration() {
  const url = supabaseUrlInput.value.trim();
  const key = supabaseAnonKeyInput.value.trim();

  if (!url || !key) {
    showMessage('Please enter both URL and Anon Key', 'error');
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (e) {
    showMessage('Invalid URL format', 'error');
    return;
  }

  try {
    await Storage.setMultiple({
      supabaseUrl: url,
      supabaseAnonKey: key
    });

    showMessage('Configuration saved successfully!', 'success');
    
    // Re-check auth status after saving config
    setTimeout(() => {
      checkAuthStatus();
    }, 500);
  } catch (error) {
    showMessage('Failed to save configuration: ' + error.message, 'error');
  }
}

// Test connection
async function testConnection() {
  const url = supabaseUrlInput.value.trim();
  const key = supabaseAnonKeyInput.value.trim();

  // Default values if empty
  const defaultUrl = 'https://xqztrdozodptapqlnyoj.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenRyZG96b2RwdGFwcWxueW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MDg4OTUsImV4cCI6MjA4MDA4NDg5NX0.bEfbybiz-ncXoCK_DxvjKSLioFVVO3UoG4ztMMYf64o';
  
  const finalUrl = url || defaultUrl;
  const finalKey = key || defaultKey;

  // Save for test (use provided or defaults)
  await Storage.setMultiple({
    supabaseUrl: finalUrl,
    supabaseAnonKey: finalKey
  });

  showMessage('Testing connection...', 'success');

  try {
    await initSupabase();
    showMessage('Connection successful! Supabase client initialized.', 'success');
  } catch (error) {
    showMessage('Connection failed: ' + error.message, 'error');
  }
}

// Check authentication status
async function checkAuthStatus() {
  try {
    const authenticated = await isAuthenticated();
    
    if (authenticated) {
      const user = await getCurrentUser();
      authStatusText.textContent = 'Signed In';
      authStatusText.style.color = '#057642';
      authUserEmail.textContent = user.email;
      signInBtn.classList.add('hidden');
      signOutBtn.classList.remove('hidden');
    } else {
      authStatusText.textContent = 'Not Signed In';
      authStatusText.style.color = '#c8102e';
      authUserEmail.textContent = '-';
      signInBtn.classList.remove('hidden');
      signOutBtn.classList.add('hidden');
    }
  } catch (error) {
    authStatusText.textContent = 'Error checking status';
    authStatusText.style.color = '#c8102e';
    authUserEmail.textContent = error.message;
    signInBtn.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
  }
}

// Handle sign out
async function handleSignOut() {
  try {
    await signOut();
    showMessage('Signed out successfully', 'success');
    await checkAuthStatus();
  } catch (error) {
    showMessage('Sign out failed: ' + error.message, 'error');
  }
}

// Default DeepSeek API Key (hardcoded)
const DEFAULT_DEEPSEEK_API_KEY = 'sk-80e102cca06342c48c385c5f0247a110';

// Load DeepSeek configuration
async function loadDeepSeekConfiguration() {
  const apiKey = await Storage.get('DEEPSEEK_API_KEY');
  // Show saved key or default
  deepseekApiKeyInput.value = apiKey || DEFAULT_DEEPSEEK_API_KEY;
  
  // Add note about default
  if (!apiKey) {
    const note = document.createElement('p');
    note.style.cssText = 'margin-top: 10px; padding: 10px; background: #f0f9f4; border-radius: 4px; font-size: 12px; color: #057642;';
    note.textContent = 'ℹ️ Default DeepSeek API key is pre-configured. You can override it if needed.';
    deepseekApiKeyInput.parentElement.appendChild(note);
  }
}

// Save DeepSeek configuration
async function saveDeepSeekConfiguration() {
  const apiKey = deepseekApiKeyInput.value.trim();

  if (!apiKey) {
    // If empty, use default
    await Storage.set('DEEPSEEK_API_KEY', DEFAULT_DEEPSEEK_API_KEY);
    deepseekApiKeyInput.value = DEFAULT_DEEPSEEK_API_KEY;
    showDeepSeekMessage('Using default DeepSeek API key', 'success');
    return;
  }

  // Basic validation (should start with sk-)
  if (!apiKey.startsWith('sk-')) {
    showDeepSeekMessage('Invalid API key format. DeepSeek keys should start with "sk-"', 'error');
    return;
  }

  try {
    await Storage.set('DEEPSEEK_API_KEY', apiKey);
    showDeepSeekMessage('DeepSeek API key saved successfully!', 'success');
  } catch (error) {
    showDeepSeekMessage('Failed to save DeepSeek API key: ' + error.message, 'error');
  }
}

// Show DeepSeek message
function showDeepSeekMessage(text, type) {
  deepseekMessageDiv.textContent = text;
  deepseekMessageDiv.className = `message ${type}`;
  deepseekMessageDiv.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    deepseekMessageDiv.classList.add('hidden');
  }, 5000);
}

// Show message
function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 5000);
}

// Initialize on load
init();
