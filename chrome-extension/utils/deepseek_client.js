/**
 * DeepSeek Client
 * Handles direct calls to DeepSeek API from Chrome Extension
 * Mirrors Flutter's deepSeekJsonObject implementation
 */

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// DeepSeek API Key (hardcoded)
// NOTE: Intentionally not configurable via the Options page.
const DEEPSEEK_API_KEY = 'sk-80e102cca06342c48c385c5f0247a110';

/**
 * Call DeepSeek API and parse JSON response
 * @param {Object} params - Request parameters
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userPrompt - User prompt
 * @param {number} params.temperature - Temperature (default 0.3)
 * @param {string} params.label - Optional label for logging
 * @returns {Promise<{parsed: Object, usage: Object}>} Parsed JSON and token usage
 */
export async function deepSeekJsonObject({ 
  systemPrompt, 
  userPrompt, 
  temperature = 0.3, 
  label = null 
}) {
  const apiKey = DEEPSEEK_API_KEY;

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: temperature,
    response_format: { type: 'json_object' }
  };

  if (label) {
    console.log(`[DeepSeek] ${label} - Calling API...`);
  }

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DeepSeek] API error ${response.status}:`, errorText);
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract content and parse JSON
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in DeepSeek response');
    }

    const parsed = JSON.parse(content);

    // Extract usage information
    const usage = {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
      cached_tokens: data.usage?.cached_tokens || 0 // DeepSeek may provide this
    };

    if (label) {
      console.log(`[DeepSeek] ${label} - Tokens: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, cached: ${usage.cached_tokens})`);
    }

    return {
      parsed,
      usage
    };
  } catch (error) {
    console.error(`[DeepSeek] Error calling API:`, error);
    throw error;
  }
}

/**
 * Check if DeepSeek is configured
 * @returns {Promise<boolean>} Always returns true (default key is always available)
 */
export async function isDeepSeekConfigured() {
  return true; // Default key is always available
}
