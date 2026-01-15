# Quick Start Guide

## Step 1: Create Icons

1. Open `create_icons_simple.html` in your browser
2. Click "Generate & Download Icons"
3. Move the downloaded files to the `icons/` folder:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`

## Step 2: Load Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `chrome-extension` folder

## Step 3: Configure Supabase

1. Click the extension icon in Chrome toolbar
2. Settings page will open automatically (or click "Settings" link)
3. Enter your Supabase credentials:
   - **Supabase URL**: `https://your-project.supabase.co`
   - **Supabase Anon Key**: Your anon/public key
4. Click "Save Configuration"
5. Click "Test Connection" to verify

## Step 4: Sign In

1. Click the extension icon
2. Sign in with your Supabase account email and password
3. Or create a new account using the "Sign Up" tab

## Step 5: Use on LinkedIn

1. Go to any LinkedIn job page, for example:
   - `https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4351598621`
   - `https://www.linkedin.com/jobs/view/4351598621`

2. Look for the "Send to SwiftCareer" button next to "Easy Apply" and "Save"

3. Click the button to send the job for analysis

4. The button will show:
   - ⏳ "Sending..." (loading)
   - ✓ "Sent successfully!" (success)
   - ✓ "Already sent" (if previously sent)
   - ⚠ Error message (if something went wrong)

## Troubleshooting

### Button not appearing?
- Make sure you're on a LinkedIn job page with a job ID in the URL
- Check browser console for errors (F12)
- Reload the page

### Authentication issues?
- Verify Supabase URL and key are correct in Settings
- Make sure your Supabase project has authentication enabled
- Check if user exists in Supabase Auth

### Job analysis fails?
- Verify `job_analysis` edge function is deployed
- Check edge function has `DEEPSEEK_API_KEY` and `APIFY_API_KEY` secrets
- Check Supabase logs for errors

## Next Steps

After sending jobs, view them in your SwiftCareer app/website. The jobs are saved in the `saved_jobs` table with full analysis results.
