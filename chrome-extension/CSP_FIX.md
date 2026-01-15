# Content Security Policy Fix

## Problem
Chrome Extensions have strict CSP that prevents loading external scripts from CDNs. The original implementation tried to import Supabase from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm` which violates CSP.

## Solution
Replaced the Supabase JS library with a direct REST API implementation that:
- Uses native `fetch()` API (allowed by CSP)
- Implements Supabase REST API endpoints directly
- Maintains the same API interface for compatibility
- No external script dependencies

## Changes Made

### 1. `utils/supabase.js`
- Removed CDN import
- Implemented Supabase REST API client using `fetch()`
- Supports:
  - Authentication (signIn, signUp, signOut)
  - Database queries (select, insert)
  - Session management
  - Token refresh

### 2. API Compatibility
The new implementation maintains the same API surface:
```javascript
const client = await getSupabaseClient();
await client.auth.signInWithPassword({ email, password });
await client.from('table').select('*').eq('column', value).maybeSingle();
```

## Benefits
- ✅ No CSP violations
- ✅ No external dependencies
- ✅ Smaller bundle size
- ✅ Same API interface (minimal code changes)
- ✅ Works with Chrome Extension CSP

## Testing
After this fix, the extension should:
1. Load without CSP errors
2. Authenticate users successfully
3. Query Supabase database
4. Call edge functions

## Notes
- All Supabase REST API calls use the standard endpoints
- Authentication tokens are stored securely in Chrome storage
- Session management is handled manually (no auto-refresh)
