/**
 * AI Cost Calculator
 * Calculates API costs and converts them to credits
 * Mirrors the Flutter AICostCalculator implementation
 */

// ══════════════════════════════════════════════════════════════════════════
// Credits pricing rules (business rules)
// ══════════════════════════════════════════════════════════════════════════
/** What the user pays per credit in USD (used to translate $ revenue into credits) */
const CREDIT_VALUE_DOLLARS = 0.04;

/** 400% margin => 5x multiplier on cost to reach target revenue */
const MARGIN_MULTIPLIER = 5.0;

/** Always charge at least 1 credit per billable operation */
const MIN_CREDITS_PER_OPERATION = 1;

// ══════════════════════════════════════════════════════════════════════════
// DeepSeek Pricing (per 1M tokens)
// ══════════════════════════════════════════════════════════════════════════
const DEEPSEEK_INPUT_CACHE_HIT = 0.028; // $0.028 / 1M
const DEEPSEEK_INPUT_CACHE_MISS = 0.28; // $0.28 / 1M
const DEEPSEEK_OUTPUT = 0.42; // $0.42 / 1M

// ══════════════════════════════════════════════════════════════════════════
// External Services
// ══════════════════════════════════════════════════════════════════════════
const APIFY_PER_RESULT = 0.005; // $5.00 / 1,000 results = $0.005 per job scrape

// ══════════════════════════════════════════════════════════════════════════
// Gemini 3 Flash Pricing (per 1M tokens)
// ══════════════════════════════════════════════════════════════════════════
const GEMINI_INPUT = 0.25; // $0.25 / 1M
const GEMINI_INPUT_CACHED = 0.05; // $0.05 / 1M
const GEMINI_OUTPUT = 1.50; // $1.50 / 1M

/**
 * Convert a real USD cost into credits using the pricing rules.
 * Fully dynamic: depends only on actual measured cost.
 * @param {number} costDollars - Cost in USD
 * @returns {number} Credits to charge
 */
export function costToCredits(costDollars) {
  if (costDollars <= 0) return 0;
  const credits = Math.ceil(costDollars * MARGIN_MULTIPLIER / CREDIT_VALUE_DOLLARS);
  return credits < MIN_CREDITS_PER_OPERATION ? MIN_CREDITS_PER_OPERATION : credits;
}

/**
 * Calculate DeepSeek cost based on token usage
 * @param {Object} params - Token usage parameters
 * @param {number} params.cacheHitTokens - Input tokens from cache hit
 * @param {number} params.cacheMissTokens - Input tokens from cache miss
 * @param {number} params.outputTokens - Output tokens
 * @param {string} params.label - Optional label for logging
 * @param {boolean} params.isInternal - If true, cost is tracked but not charged
 * @returns {Object} Cost information { totalCost, credits }
 */
export function calculateDeepSeekCost({ cacheHitTokens = 0, cacheMissTokens = 0, outputTokens = 0, label = null, isInternal = false }) {
  const inputCacheHitCost = (cacheHitTokens / 1000000) * DEEPSEEK_INPUT_CACHE_HIT;
  const inputCacheMissCost = (cacheMissTokens / 1000000) * DEEPSEEK_INPUT_CACHE_MISS;
  const outputCost = (outputTokens / 1000000) * DEEPSEEK_OUTPUT;
  const totalCost = inputCacheHitCost + inputCacheMissCost + outputCost;
  const credits = isInternal ? 0 : costToCredits(totalCost);

  if (label) {
    const prefix = `💵 ${label}`;
    if (isInternal) {
      console.log(`${prefix} Cost: $${totalCost.toFixed(6)} (hit: $${inputCacheHitCost.toFixed(6)}, miss: $${inputCacheMissCost.toFixed(6)}, out: $${outputCost.toFixed(6)}) | 🔧 Internal (no charge)`);
    } else {
      console.log(`${prefix} Cost: $${totalCost.toFixed(6)} (hit: $${inputCacheHitCost.toFixed(6)}, miss: $${inputCacheMissCost.toFixed(6)}, out: $${outputCost.toFixed(6)}) | 🎫 Credits: ${credits}`);
    }
  }

  return {
    totalCost,
    credits,
    inputCacheHitCost,
    inputCacheMissCost,
    outputCost
  };
}

/**
 * Calculate Gemini cost based on token usage.
 * Mirrors Flutter AICostCalculator.calculateGeminiCost.
 *
 * @param {Object} params
 * @param {number} params.promptTokens - Total prompt tokens
 * @param {number} params.outputTokens - Output tokens
 * @param {number} params.cachedTokens - Cached prompt tokens (subset of promptTokens)
 * @param {string} params.label - Optional label for logging
 * @param {boolean} params.isInternal - If true, cost is tracked but not charged
 * @returns {Object} Cost information { totalCost, credits, inputCost, cachedInputCost, outputCost }
 */
export function calculateGeminiCost({ promptTokens = 0, outputTokens = 0, cachedTokens = 0, label = null, isInternal = false }) {
  const pt = Math.max(0, Number(promptTokens || 0));
  const ct = Math.max(0, Number(cachedTokens || 0));
  const out = Math.max(0, Number(outputTokens || 0));

  const cacheHitTokens = Math.min(pt, ct);
  const cacheMissTokens = Math.max(0, pt - cacheHitTokens);

  const cachedInputCost = (cacheHitTokens / 1000000) * GEMINI_INPUT_CACHED;
  const inputCost = (cacheMissTokens / 1000000) * GEMINI_INPUT;
  const outputCost = (out / 1000000) * GEMINI_OUTPUT;
  const totalCost = cachedInputCost + inputCost + outputCost;
  const credits = isInternal ? 0 : costToCredits(totalCost);

  if (label) {
    const prefix = `💵 ${label}`;
    if (isInternal) {
      console.log(
        `${prefix} Cost: $${totalCost.toFixed(6)} (in: $${inputCost.toFixed(6)}, cached: $${cachedInputCost.toFixed(6)}, out: $${outputCost.toFixed(6)}) | 🔧 Internal (no charge)`
      );
    } else {
      console.log(
        `${prefix} Cost: $${totalCost.toFixed(6)} (in: $${inputCost.toFixed(6)}, cached: $${cachedInputCost.toFixed(6)}, out: $${outputCost.toFixed(6)}) | 🎫 Credits: ${credits}`
      );
    }
  }

  return {
    totalCost,
    credits,
    inputCost,
    cachedInputCost,
    outputCost
  };
}

/**
 * Calculate Apify job scraping cost
 * @param {string} label - Optional label for logging
 * @returns {Object} Cost information { totalCost, credits }
 */
export function calculateApifyCost(label = null) {
  const cost = APIFY_PER_RESULT;
  const credits = costToCredits(cost);

  if (label) {
    const prefix = label || '🔗 Apify Job Scrape';
    console.log(`${prefix} Cost: $${cost.toFixed(6)} | 🎫 Credits: ${credits}`);
  }

  return {
    totalCost: cost,
    credits
  };
}

/**
 * Calculate cost from token usage object (from DeepSeek API response)
 * @param {Object} usage - Token usage from API response
 * @param {number} usage.prompt_tokens - Total prompt tokens
 * @param {number} usage.completion_tokens - Completion tokens
 * @param {number} usage.total_tokens - Total tokens
 * @param {number} usage.cached_tokens - Cached tokens (if available)
 * @param {string} label - Optional label for logging
 * @returns {Object} Cost information { totalCost, credits, cacheHitTokens, cacheMissTokens, outputTokens }
 */
export function calculateCostFromUsage(usage, label = null) {
  if (!usage) {
    return {
      totalCost: 0,
      credits: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      outputTokens: 0
    };
  }

  // DeepSeek API returns prompt_tokens, completion_tokens, total_tokens
  // We need to estimate cache hit/miss split
  // For now, we'll assume all prompt tokens are cache miss (conservative estimate)
  // In production, DeepSeek API should provide this information
  const promptTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const cachedTokens = usage.cached_tokens || 0;
  
  // If cached_tokens is provided, use it; otherwise assume all are cache miss
  const cacheHitTokens = cachedTokens;
  const cacheMissTokens = promptTokens - cachedTokens;

  return calculateDeepSeekCost({
    cacheHitTokens: Math.max(0, cacheHitTokens),
    cacheMissTokens: Math.max(0, cacheMissTokens),
    outputTokens: outputTokens,
    label: label
  });
}

/**
 * Calculate Gemini cost from Gemini usageMetadata mapped to our common usage object.
 * Expects usage: { prompt_tokens, completion_tokens, cached_tokens }.
 */
export function calculateGeminiCostFromUsage(usage, label = null) {
  if (!usage) {
    return {
      totalCost: 0,
      credits: 0,
      inputCost: 0,
      cachedInputCost: 0,
      outputCost: 0
    };
  }
  return calculateGeminiCost({
    promptTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    cachedTokens: usage.cached_tokens || 0,
    label
  });
}

/**
 * Calculate total cost from job analysis tokenUsage (matches Flutter logic)
 * @param {Object} tokenUsage - Token usage from job_analysis response
 * @param {Object} tokenUsage.total - Total token usage { prompt_tokens, completion_tokens, cached_tokens }
 * @param {Array} tokenUsage.operations - Array of operations with individual usage
 * @param {boolean} usedApify - Whether Apify was used for scraping
 * @returns {Object} { totalCost, credits, deepSeekCost, apifyCost }
 */
export function calculateJobAnalysisCost(tokenUsage, usedApify = false) {
  if (!tokenUsage || !tokenUsage.total) {
    console.warn('[CostCalculator] No tokenUsage provided, returning zero cost');
    return {
      totalCost: 0,
      credits: 0,
      deepSeekCost: 0,
      apifyCost: 0
    };
  }

  const total = tokenUsage.total;
  const promptTokens = total.prompt_tokens || 0;
  const outputTokens = total.completion_tokens || 0;
  const cachedTokens = total.cached_tokens || 0;

  // Split prompt tokens into cache hit vs miss (exactly like Flutter)
  const cacheHitTokens = cachedTokens || 0;
  const cacheMissTokens = Math.max(0, promptTokens - cachedTokens);

  // Calculate DeepSeek cost
  const deepSeekResult = calculateDeepSeekCost({
    cacheHitTokens: cacheHitTokens,
    cacheMissTokens: cacheMissTokens,
    outputTokens: outputTokens,
    label: 'Job Analysis'
  });

  // Calculate Apify cost if used
  let apifyCost = 0;
  let apifyCredits = 0;
  if (usedApify) {
    const apifyResult = calculateApifyCost('Apify Job Scrape');
    apifyCost = apifyResult.totalCost;
    apifyCredits = apifyResult.credits;
  }

  // Total cost and credits
  const totalCost = deepSeekResult.totalCost + apifyCost;
  const totalCredits = costToCredits(totalCost);

  console.log('[CostCalculator] 💰 Job Analysis Cost Breakdown:', {
    deepSeekCost: deepSeekResult.totalCost,
    apifyCost: apifyCost,
    totalCost: totalCost,
    credits: totalCredits,
    tokenUsage: {
      promptTokens,
      outputTokens,
      cachedTokens,
      cacheHitTokens,
      cacheMissTokens
    }
  });

  return {
    totalCost: totalCost,
    credits: totalCredits,
    deepSeekCost: deepSeekResult.totalCost,
    apifyCost: apifyCost
  };
}

// Export constants for reference
export const PRICING = {
  CREDIT_VALUE_DOLLARS,
  MARGIN_MULTIPLIER,
  MIN_CREDITS_PER_OPERATION,
  DEEPSEEK_INPUT_CACHE_HIT,
  DEEPSEEK_INPUT_CACHE_MISS,
  DEEPSEEK_OUTPUT,
  GEMINI_INPUT,
  GEMINI_INPUT_CACHED,
  GEMINI_OUTPUT,
  APIFY_PER_RESULT
};
