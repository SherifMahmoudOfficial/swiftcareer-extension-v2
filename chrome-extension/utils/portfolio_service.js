/**
 * Portfolio Service
 * Uploads generated portfolio HTML to Supabase Storage and returns a viewer URL.
 *
 * Mirrors Flutter PortfolioService.uploadPortfolioToStorage + portfolio_view Edge Function usage.
 */

import { getSupabaseClient, getAccessToken } from './supabase.js';

/**
 * Upload HTML to Supabase Storage.
 *
 * @param {Object} params
 * @param {string} params.htmlContent
 * @param {string} params.userId
 * @param {string} [params.bucketName]
 * @returns {Promise<{viewerUrl: string, bucket: string, path: string}>}
 */
export async function uploadPortfolioToStorage({
  htmlContent,
  userId,
  bucketName = 'portfolios'
}) {
  const client = await getSupabaseClient();
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('User must be authenticated to upload portfolio');
  }

  const timestamp = Date.now();
  const path = `${userId}/portfolio_${timestamp}.html`;

  // Supabase Storage upload endpoint:
  // POST /storage/v1/object/<bucket>/<path>
  const uploadUrl = `${client.url}/storage/v1/object/${encodeURIComponent(bucketName)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': client.key,
      'Content-Type': 'text/html; charset=utf-8',
      // allow overwrite? keep false like Flutter (upsert: false)
      'x-upsert': 'false'
    },
    body: new Blob([String(htmlContent || '')], { type: 'text/html; charset=utf-8' })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to upload portfolio: ${res.status} ${res.statusText} ${errText}`.trim());
  }

  // Serve through Edge Function to avoid restrictive headers on public storage URLs.
  const viewerUrl = `${client.url}/functions/v1/portfolio_view?bucket=${encodeURIComponent(bucketName)}&path=${encodeURIComponent(path)}`;

  return { viewerUrl, bucket: bucketName, path };
}

