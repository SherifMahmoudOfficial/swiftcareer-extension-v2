/**
 * Gemini Client (Google Generative Language API)
 * Used for Portfolio generation (HTML output)
 */

const GEMINI_API_KEY = 'AIzaSyAoZ24YIGF2uW3NjMTb4C3zv-PC8GpHE8c';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function extractGeminiErrorMessage(text) {
  try {
    const decoded = JSON.parse(text);
    const msg = decoded?.error?.message;
    if (typeof msg === 'string' && msg.trim().length > 0) return msg.trim();
  } catch (_) {
    // ignore
  }
  return (text || '').trim() || 'Unknown error';
}

function extractCandidateText(responseData) {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];
  for (const c of candidates) {
    const parts = c?.content?.parts;
    if (Array.isArray(parts)) {
      const combined = parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('');
      if (combined.trim().length > 0) return combined;
    }
  }
  return '';
}

/**
 * Call Gemini API with explicit system + user prompts.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} params.maxOutputTokens
 * @param {number} params.temperature
 * @param {string|null} params.label
 * @returns {Promise<{content: string, usage: {prompt_tokens:number, completion_tokens:number, total_tokens:number, cached_tokens:number}}>}
 */
export async function callGeminiAPI({
  systemPrompt,
  userPrompt,
  maxOutputTokens = 24576,
  temperature = 1.0,
  label = null
}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const requestBody = {
    systemInstruction: { parts: [{ text: String(systemPrompt || '') }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: String(userPrompt || '') }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (label) {
    console.log(`[Gemini] ${label} - Calling API...`, {
      model: GEMINI_MODEL,
      systemChars: (systemPrompt || '').length,
      userChars: (userPrompt || '').length,
      maxOutputTokens
    });
  }

  const maxAttempts = 4;
  let lastErr = null;
  let data = null;
  let text = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${GEMINI_BASE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    text = await res.text();
    if (!res.ok) {
      const msg = extractGeminiErrorMessage(text);
      const err = new Error(`Gemini API error ${res.status}: ${msg}`);
      lastErr = err;

      // Retry on rate limiting / transient backend issues.
      if (res.status === 429 || res.status === 503) {
        const backoffMs = Math.round(1200 * Math.pow(2, attempt - 1) + Math.random() * 400);
        console.warn(`[Gemini] ${label || 'call'} - Retryable error (${res.status}) attempt ${attempt}/${maxAttempts}. Backing off ${backoffMs}ms.`);
        if (attempt < maxAttempts) {
          await sleep(backoffMs);
          continue;
        }
      }

      throw err;
    }

    data = JSON.parse(text);
    break;
  }

  if (!data) {
    throw lastErr || new Error('Gemini API error: no response data');
  }

  const content = extractCandidateText(data).trim();
  if (!content) throw new Error('Empty response from Gemini API');

  // Map Gemini usageMetadata -> extension usage shape
  const usageMetadata = data?.usageMetadata || {};
  const prompt_tokens = Number(usageMetadata.promptTokenCount || 0);
  const completion_tokens = Number(usageMetadata.candidatesTokenCount || 0);
  const total_tokens = Number(usageMetadata.totalTokenCount || 0);
  const cached_tokens = Number(usageMetadata.cachedContentTokenCount || 0);

  const usage = {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cached_tokens
  };

  if (label) {
    console.log(`[Gemini] ${label} - Tokens: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, cached: ${usage.cached_tokens})`);
  }

  return { content, usage };
}

