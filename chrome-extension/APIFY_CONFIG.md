# Apify API Key Configuration

## Apify API Key
```
<YOUR_APIFY_API_KEY>
```

## Important Note

This API key is **NOT** used in the Chrome extension. It must be configured in your **Supabase Edge Function** secrets.

## How to Configure

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → **job_analysis**
3. Go to **Settings** → **Secrets**
4. Add a new secret:
   - **Name**: `APIFY_API_KEY`
   - **Value**: `<YOUR_APIFY_API_KEY>`
5. Save the secret

## Usage

The `job_analysis` edge function uses this key to:
- Scrape LinkedIn job data via Apify
- Extract job information, skills, and descriptions
- Process job listings for analysis

The Chrome extension does **NOT** need this key - it only calls the edge function, which handles the Apify integration internally.

## Security

⚠️ **Important**: 
- This key should only be stored in Supabase Edge Function secrets
- Never commit this key to version control
- Never expose this key in client-side code (Chrome extension)
- The extension uses the edge function as a secure proxy
