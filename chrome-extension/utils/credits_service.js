/**
 * Credits Service
 * Handles credits balance, deduction, and transaction logging
 * Mirrors the Flutter CreditsService implementation
 */

import { getSupabaseClient, getAccessToken } from './supabase.js';

/**
 * Get current credits balance for a user
 * @param {string} userId - User ID (optional, uses current user if not provided)
 * @returns {Promise<number>} Current credits balance
 */
export async function getBalance(userId = null) {
  try {
    const client = await getSupabaseClient();
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      console.error('[CreditsService] No access token found');
      return 0;
    }

    // Get current user if userId not provided
    let targetUserId = userId;
    if (!targetUserId) {
      const userResponse = await fetch(`${client.url}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': client.key
        }
      });
      
      if (!userResponse.ok) {
        console.error('[CreditsService] Failed to get current user');
        return 0;
      }
      
      const userData = await userResponse.json();
      targetUserId = userData.id;
    }

    if (!targetUserId) {
      console.error('[CreditsService] No user ID available');
      return 0;
    }

    const row = await client
      .from('users')
      .select('credits_balance')
      .eq('id', targetUserId)
      .single();

    return (row?.credits_balance ?? 0);
  } catch (e) {
    console.error('[CreditsService] getBalance error:', e);
    return 0;
  }
}

/**
 * Check if user has enough credits
 * @param {number} needed - Required credits
 * @param {string} userId - User ID (optional)
 * @returns {Promise<boolean>} True if user has enough credits
 */
export async function hasEnoughCredits(needed, userId = null) {
  if (needed <= 0) return true;
  const balance = await getBalance(userId);
  return balance >= needed;
}

/**
 * Deduct credits from user balance
 * @param {Object} params - Deduction parameters
 * @param {number} params.credits - Credits to deduct
 * @param {string} params.reason - Reason for deduction
 * @param {string} params.userId - User ID (optional)
 * @param {string} params.source - Source of deduction (e.g., 'deepseek', 'apify')
 * @param {number} params.costDollars - Cost in USD (optional)
 * @returns {Promise<boolean>} True if deduction was successful
 */
export async function deductCredits({ credits, reason, userId = null, source = null, costDollars = null }) {
  if (credits <= 0) return true;

  try {
    const client = await getSupabaseClient();
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      console.error('[CreditsService] No access token found');
      return false;
    }

    // Get current user if userId not provided
    let targetUserId = userId;
    if (!targetUserId) {
      const userResponse = await fetch(`${client.url}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': client.key
        }
      });
      
      if (!userResponse.ok) {
        console.error('[CreditsService] Failed to get current user');
        return false;
      }
      
      const userData = await userResponse.json();
      targetUserId = userData.id;
    }

    if (!targetUserId) {
      console.error('[CreditsService] No user ID available');
      return false;
    }

    // Get current balance and used credits
    const current = await client
      .from('users')
      .select('credits_balance, credits_used')
      .eq('id', targetUserId)
      .single();

    if (!current) {
      console.error('[CreditsService] User not found');
      return false;
    }

    const currentBalance = current.credits_balance ?? 0;
    const currentUsed = current.credits_used ?? 0;

    const newBalance = currentBalance - credits;
    const newUsed = currentUsed + credits;

    // Update user balance
    const updated = await client
      .from('users')
      .update({
        credits_balance: newBalance,
        credits_used: newUsed
      })
      .eq('id', targetUserId)
      .select()
      .single();

    const balanceAfter = updated?.credits_balance ?? newBalance;

    // Log transaction
    await logTransaction({
      userId: targetUserId,
      amount: -credits,
      balanceAfter: balanceAfter,
      reason: reason,
      source: source,
      costDollars: costDollars
    });

    console.log(`[CreditsService] 🎫 Credits deducted: ${credits} | balance: ${currentBalance} → ${balanceAfter} | reason: ${reason}`);
    return true;
  } catch (e) {
    console.error('[CreditsService] deductCredits error:', e);
    return false;
  }
}

/**
 * Add credits to user balance
 * @param {Object} params - Addition parameters
 * @param {number} params.credits - Credits to add
 * @param {string} params.reason - Reason for addition
 * @param {string} params.userId - User ID (optional)
 * @param {string} params.source - Source of addition (e.g., 'purchase', 'referral')
 * @returns {Promise<boolean>} True if addition was successful
 */
export async function addCredits({ credits, reason, userId = null, source = null }) {
  if (credits <= 0) return true;

  try {
    const client = await getSupabaseClient();
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      console.error('[CreditsService] No access token found');
      return false;
    }

    // Get current user if userId not provided
    let targetUserId = userId;
    if (!targetUserId) {
      const userResponse = await fetch(`${client.url}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': client.key
        }
      });
      
      if (!userResponse.ok) {
        console.error('[CreditsService] Failed to get current user');
        return false;
      }
      
      const userData = await userResponse.json();
      targetUserId = userData.id;
    }

    if (!targetUserId) {
      console.error('[CreditsService] No user ID available');
      return false;
    }

    // Get current balance
    const current = await client
      .from('users')
      .select('credits_balance')
      .eq('id', targetUserId)
      .single();

    if (!current) {
      console.error('[CreditsService] User not found');
      return false;
    }

    const currentBalance = current.credits_balance ?? 0;
    const newBalance = currentBalance + credits;

    // Update user balance
    const updated = await client
      .from('users')
      .update({
        credits_balance: newBalance
      })
      .eq('id', targetUserId)
      .select()
      .single();

    const balanceAfter = updated?.credits_balance ?? newBalance;

    // Log transaction
    await logTransaction({
      userId: targetUserId,
      amount: credits,
      balanceAfter: balanceAfter,
      reason: reason,
      source: source,
      costDollars: null
    });

    console.log(`[CreditsService] 🎫 Credits added: ${credits} | balance: ${currentBalance} → ${balanceAfter} | reason: ${reason}`);
    return true;
  } catch (e) {
    console.error('[CreditsService] addCredits error:', e);
    return false;
  }
}

/**
 * Log a credits transaction to the ledger
 * @param {Object} params - Transaction parameters
 * @param {string} params.userId - User ID
 * @param {number} params.amount - Transaction amount (positive for additions, negative for deductions)
 * @param {number} params.balanceAfter - Balance after transaction
 * @param {string} params.reason - Reason for transaction
 * @param {string} params.source - Source of transaction
 * @param {number} params.costDollars - Cost in USD (optional)
 * @returns {Promise<void>}
 */
async function logTransaction({ userId, amount, balanceAfter, reason, source = null, costDollars = null }) {
  try {
    const client = await getSupabaseClient();
    
    await client
      .from('credits_transactions')
      .insert({
        user_id: userId,
        amount: amount,
        balance_after: balanceAfter,
        source: source,
        reason: reason,
        cost_dollars: costDollars
      })
      .select()
      .single();
  } catch (e) {
    // Best-effort: do not fail the main operation if ledger insert fails
    console.error('[CreditsService] logTransaction error:', e);
  }
}
