# SwiftCareer Chrome Extension

Chrome extension that adds a "Send to SwiftCareer" button on LinkedIn job pages to analyze jobs and save them to your SwiftCareer account.

## Features

- ✅ Inject "Send to SwiftCareer" button on LinkedIn job pages
- ✅ Extract job ID from LinkedIn URLs
- ✅ Authenticate with Supabase
- ✅ Call job_analysis edge function
- ✅ Save jobs to saved_jobs table
- ✅ Prevent duplicate submissions
- ✅ Beautiful LinkedIn-style UI with feedback states

## Installation

### Development Setup

1. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

2. **Configure Supabase:**
   - Click the extension icon in the toolbar
   - Go to Settings (or it will open automatically on first install)
   - Enter your Supabase URL and Anon Key
   - Click "Save Configuration"
   - Click "Test Connection" to verify

3. **Sign In:**
   - Click the extension icon
   - Sign in with your Supabase account credentials
   - Or create a new account

4. **Create Icons:**
   - The extension needs icon files in the `icons/` folder
   - See "Creating Icons" section below

## Creating Icons

The extension requires three icon files:
- `icons/icon16.png` (16x16 pixels)
- `icons/icon48.png` (48x48 pixels)
- `icons/icon128.png` (128x128 pixels)

### Option 1: Use the HTML Generator

1. Open `create_placeholder_icons.html` in your browser
2. The icons will automatically download
3. Move them to the `icons/` folder

### Option 2: Create Manually

Use any image editor to create icons with:
- Background color: LinkedIn blue (#0A66C2)
- Text/Logo: White "S" or SwiftCareer logo
- Format: PNG with transparency (optional)

### Option 3: Use Online Tools

Use tools like:
- [Favicon Generator](https://www.favicon-generator.org/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

## Usage

1. **Navigate to a LinkedIn job page:**
   - Go to any LinkedIn job listing
   - The extension works on pages like:
     - `https://www.linkedin.com/jobs/collections/recommended/?currentJobId=XXXXX`
     - `https://www.linkedin.com/jobs/view/XXXXX`

2. **Find the button:**
   - Look for the "Send to SwiftCareer" button next to "Easy Apply" and "Save" buttons
   - It should appear automatically on job pages

3. **Send job for analysis:**
   - Click "Send to SwiftCareer"
   - If not signed in, you'll be prompted to sign in
   - The button will show loading state
   - On success, it will show "Sent successfully!"
   - If already sent, it will show "Already sent"

4. **View results:**
   - Go to your SwiftCareer app/website
   - Check the `saved_jobs` table or your job list
   - View the analysis results

## File Structure

```
chrome-extension/
├── manifest.json          # Extension manifest
├── icons/                 # Extension icons (create these)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── content/              # Content scripts
│   ├── content.js        # Main injection logic
│   └── content.css       # Button styles
├── background/           # Service worker
│   └── background.js     # API calls and message handling
├── popup/                # Authentication popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/              # Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
└── utils/               # Shared utilities
    ├── supabase.js      # Supabase client
    ├── api.js           # API functions
    └── storage.js       # Chrome storage helpers
```

## Configuration

### Supabase Setup

1. Get your Supabase credentials:
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Select your project
   - Go to Settings → API
   - Copy "Project URL" and "anon public" key

2. Enter in extension settings:
   - Click extension icon → Settings
   - Paste URL and key
   - Click "Save Configuration"

### Edge Function

Make sure your `job_analysis` edge function is deployed and configured with:
- `DEEPSEEK_API_KEY` secret
- `APIFY_API_KEY` secret (for LinkedIn scraping)

## Development

### Testing

1. Load extension in developer mode
2. Open Chrome DevTools for the extension:
   - Right-click extension icon → "Inspect popup" (for popup)
   - Go to `chrome://extensions/` → "Service worker" (for background)
   - Right-click page → "Inspect" (for content script)

2. Check console for errors
3. Test on LinkedIn job pages

### Debugging

- **Content Script:** Use page DevTools console
- **Background:** Use extension service worker console
- **Popup:** Right-click extension icon → Inspect popup

## Troubleshooting

### Button not appearing
- Check if you're on a LinkedIn job page
- Check browser console for errors
- Verify content script is loaded (check `chrome://extensions/`)

### Authentication errors
- Verify Supabase URL and key are correct
- Check if user exists in Supabase
- Check browser console for detailed errors

### Job analysis fails
- Verify edge function is deployed
- Check edge function logs in Supabase dashboard
- Verify API keys are set in edge function secrets

### Icons not showing
- Make sure icon files exist in `icons/` folder
- Verify file names match manifest.json
- Reload extension after adding icons

## Security Notes

- Supabase credentials are stored in Chrome local storage (encrypted by Chrome)
- Authentication tokens are stored securely
- All API calls use HTTPS
- No data is sent to third parties except Supabase

## License

Part of the SwiftCareer project.
