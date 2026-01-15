/**
 * Supabase Client Implementation
 * Uses REST API directly to avoid CSP issues with external CDN
 */

import { Storage } from './storage.js';

// Default Supabase configuration (hardcoded)
const DEFAULT_SUPABASE_URL = 'https://xqztrdozodptapqlnyoj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenRyZG96b2RwdGFwcWxueW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MDg4OTUsImV4cCI6MjA4MDA4NDg5NX0.bEfbybiz-ncXoCK_DxvjKSLioFVVO3UoG4ztMMYf64o';

let supabaseUrl = null;
let supabaseAnonKey = null;

/**
 * Initialize Supabase configuration
 */
async function initConfig() {
  // Try to get from storage first, fallback to defaults
  const config = await Storage.getMultiple(['supabaseUrl', 'supabaseAnonKey']);
  
  supabaseUrl = (config.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, ''); // Remove trailing slash
  supabaseAnonKey = config.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;
}

/**
 * Make authenticated request to Supabase
 */
async function supabaseRequest(endpoint, options = {}) {
  await initConfig();
  
  const url = `${supabaseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
    ...options.headers
  };

  // Add auth token if available (unless skipAuth is set)
  if (!options.skipAuth) {
    const session = await Storage.get('supabaseSession');
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error_description || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Initialize Supabase client (for compatibility)
 */
export async function initSupabase() {
  await initConfig();
  return {
    url: supabaseUrl,
    key: supabaseAnonKey
  };
}

/**
 * Get current Supabase client instance
 */
export async function getSupabaseClient() {
  await initConfig();
  return {
    url: supabaseUrl,
    key: supabaseAnonKey,
    from: (table) => ({
      select: (columns = '*') => {
        const queryBuilder = {
          filters: [],
          async maybeSingle() {
            const filters = this.filters.map(f => `${f.column}=eq.${encodeURIComponent(f.value)}`).join('&');
            const endpoint = `/rest/v1/${table}?${filters}&select=${columns}`;
            const data = await supabaseRequest(endpoint);
            return Array.isArray(data) && data.length > 0 ? data[0] : null;
          },
          async single() {
            const filters = this.filters.map(f => `${f.column}=eq.${encodeURIComponent(f.value)}`).join('&');
            const endpoint = `/rest/v1/${table}?${filters}&select=${columns}`;
            const data = await supabaseRequest(endpoint);
            if (Array.isArray(data)) {
              if (data.length > 0) {
                return data[0];
              }
              throw new Error('No rows returned');
            }
            return data;
          },
          eq(column, value) {
            this.filters.push({ column, value });
            return this;
          },
          async then(resolve, reject) {
            try {
              const filters = this.filters.map(f => `${f.column}=eq.${encodeURIComponent(f.value)}`).join('&');
              const endpoint = `/rest/v1/${table}?${filters}&select=${columns}`;
              const data = await supabaseRequest(endpoint);
              if (Array.isArray(data)) {
                resolve(data);
              } else {
                resolve([data]);
              }
            } catch (error) {
              reject(error);
            }
          }
        };
        return queryBuilder;
      },
      insert: (values) => {
        // Return query builder for chaining .select().single()
        const queryBuilder = {
          values: Array.isArray(values) ? values : [values],
          selectColumns: '*',
          select(columns = '*') {
            this.selectColumns = columns;
            return this;
          },
          async single() {
            const endpoint = `/rest/v1/${table}?select=${this.selectColumns}`;
            const response = await supabaseRequest(endpoint, {
              method: 'POST',
              body: JSON.stringify(this.values),
              headers: {
                'Prefer': 'return=representation'
              }
            });
            // Supabase returns array with Prefer: return=representation
            return Array.isArray(response) ? response[0] : response;
          },
          // For backward compatibility: allow direct await without .select().single()
          async then(resolve, reject) {
            try {
              const endpoint = `/rest/v1/${table}`;
              const response = await supabaseRequest(endpoint, {
                method: 'POST',
                body: JSON.stringify(this.values),
                headers: {
                  'Prefer': 'return=representation'
                }
              });
              const result = Array.isArray(response) ? response[0] : response;
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        };
        return queryBuilder;
      },
      update: (values) => {
        // New update method with query builder
        const queryBuilder = {
          values,
          filters: [],
          selectColumns: '*',
          eq(column, value) {
            this.filters.push({ column, value });
            return this;
          },
          select(columns = '*') {
            this.selectColumns = columns;
            return this;
          },
          async single() {
            if (this.filters.length === 0) {
              throw new Error('Update requires at least one filter (e.g., .eq())');
            }
            const filters = this.filters.map(f => `${f.column}=eq.${encodeURIComponent(f.value)}`).join('&');
            const endpoint = `/rest/v1/${table}?${filters}&select=${this.selectColumns}`;
            const response = await supabaseRequest(endpoint, {
              method: 'PATCH',
              body: JSON.stringify(this.values),
              headers: {
                'Prefer': 'return=representation'
              }
            });
            // Supabase returns array with Prefer: return=representation
            return Array.isArray(response) ? response[0] : response;
          }
        };
        return queryBuilder;
      }
    }),
    auth: {
      signInWithPassword: async ({ email, password }) => {
        const endpoint = '/auth/v1/token?grant_type=password';
        try {
          const response = await supabaseRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            skipAuth: true // Don't add auth header for login
          });
          return { data: response, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      signUp: async ({ email, password }) => {
        const endpoint = '/auth/v1/signup';
        try {
          const response = await supabaseRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            skipAuth: true // Don't add auth header for signup
          });
          return { data: response, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      signOut: async () => {
        const endpoint = '/auth/v1/logout';
        try {
          await supabaseRequest(endpoint, { method: 'POST' });
        } catch (error) {
          // Ignore errors on signout
        }
        return { error: null };
      },
      getSession: async () => {
        const storedSession = await Storage.get('supabaseSession');
        if (!storedSession) {
          return { data: { session: null }, error: null };
        }
        
        // Verify token is still valid
        try {
          const endpoint = '/auth/v1/user';
          const user = await supabaseRequest(endpoint);
          return {
            data: {
              session: {
                access_token: storedSession.access_token,
                refresh_token: storedSession.refresh_token,
                expires_at: storedSession.expires_at,
                user: user
              }
            },
            error: null
          };
        } catch (error) {
          // Token invalid, clear it
          await Storage.remove('supabaseSession');
          return { data: { session: null }, error };
        }
      },
      setSession: async ({ access_token, refresh_token }) => {
        // Verify token
        try {
          const endpoint = '/auth/v1/user';
          const response = await fetch(`${supabaseUrl}${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'apikey': supabaseAnonKey
            }
          });
          
          if (!response.ok) {
            throw new Error('Invalid token');
          }
          
          const user = await response.json();
          
          // Get expires_at from token (JWT)
          let expires_at = null;
          try {
            const payload = JSON.parse(atob(access_token.split('.')[1]));
            expires_at = payload.exp;
          } catch (e) {
            // Ignore
          }
          
          const session = {
            access_token,
            refresh_token,
            expires_at,
            user
          };
          
          await Storage.set('supabaseSession', session);
          
          return { data: { session }, error: null };
        } catch (error) {
          return { data: { session: null }, error };
        }
      }
    }
  };
}

/**
 * Get current session
 */
export async function getSession() {
  const client = await getSupabaseClient();
  
  // First, try to restore session from storage
  const storedSession = await Storage.get('supabaseSession');
  if (storedSession) {
    try {
      // Verify and set the session
      const { data, error } = await client.auth.setSession({
        access_token: storedSession.access_token,
        refresh_token: storedSession.refresh_token
      });
      
      if (!error && data.session) {
        return data.session;
      }
    } catch (error) {
      // Session invalid, clear it
      await Storage.remove('supabaseSession');
    }
  }
  
  // Fallback to getSession
  const { data: { session }, error } = await client.auth.getSession();
  
  if (error) {
    throw error;
  }
  
  return session;
}

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  // Store session in Chrome storage
  // Supabase REST API returns: { access_token, refresh_token, expires_in, user, ... }
  if (data && data.access_token) {
    const expires_at = data.expires_in 
      ? Math.floor(Date.now() / 1000) + data.expires_in 
      : data.expires_at;
    
    await Storage.set('supabaseSession', {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expires_at,
      user: data.user
    });
  }

  return data;
}

/**
 * Sign up with email and password
 */
export async function signUp(email, password) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sign out
 */
export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  
  if (error) {
    throw error;
  }

  // Clear session from storage
  await Storage.remove('supabaseSession');
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  try {
    const session = await getSession();
    return !!session;
  } catch (error) {
    return false;
  }
}

/**
 * Refresh session if needed
 */
export async function refreshSession() {
  const storedSession = await Storage.get('supabaseSession');
  
  if (!storedSession) {
    return null;
  }

  const client = await getSupabaseClient();
  
  // Set the session (this will verify it)
  const { data, error } = await client.auth.setSession({
    access_token: storedSession.access_token,
    refresh_token: storedSession.refresh_token
  });

  if (error) {
    // Session expired, clear it
    await Storage.remove('supabaseSession');
    throw error;
  }

  return data.session;
}

/**
 * Get access token for API calls
 */
export async function getAccessToken() {
  try {
    const session = await getSession();
    return session?.access_token || null;
  } catch (error) {
    // Try to refresh
    try {
      const refreshed = await refreshSession();
      return refreshed?.access_token || null;
    } catch (refreshError) {
      return null;
    }
  }
}
