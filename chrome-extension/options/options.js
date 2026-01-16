/**
 * Options Page Script
 * Handles only one setting: createPortfolio (boolean)
 */

import { Storage } from '../utils/storage.js';

const STORAGE_KEY_CREATE_PORTFOLIO = 'createPortfolio';
const DEFAULT_CREATE_PORTFOLIO = true;

// DOM Elements
const createPortfolioToggle = document.getElementById('createPortfolioToggle');
const createPortfolioState = document.getElementById('createPortfolioState');
const messageDiv = document.getElementById('message');

function setStateLabel(enabled) {
  createPortfolioState.textContent = enabled ? 'ON' : 'OFF';
  createPortfolioState.classList.toggle('on', enabled);
  createPortfolioState.classList.toggle('off', !enabled);
}

function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');

  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 2000);
}

async function load() {
  const stored = await Storage.get(STORAGE_KEY_CREATE_PORTFOLIO);
  const value = typeof stored === 'boolean' ? stored : DEFAULT_CREATE_PORTFOLIO;
  createPortfolioToggle.checked = value;
  setStateLabel(value);
}

async function save(value) {
  await Storage.set(STORAGE_KEY_CREATE_PORTFOLIO, !!value);
}

function setup() {
  createPortfolioToggle.addEventListener('change', async () => {
    const enabled = createPortfolioToggle.checked;
    await save(enabled);
    setStateLabel(enabled);
    showMessage('Saved', 'success');
  });
}

async function init() {
  await load();
  setup();
}

init();
