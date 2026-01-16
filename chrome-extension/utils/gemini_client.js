/**
 * Gemini Client (Google Generative Language API)
 * Used for Portfolio generation (HTML output)
 */

const GEMINI_API_KEY = 'AIzaSyBqhQUmV6Mf2jLs5zDIioENRBe9Lxw4now';
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

  const res = await fetch(`${GEMINI_BASE_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const text = await res.text();
  if (!res.ok) {
    const msg = extractGeminiErrorMessage(text);
    throw new Error(`Gemini API error ${res.status}: ${msg}`);
  }

  const data = JSON.parse(text);
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

