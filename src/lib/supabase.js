import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit'
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey,
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Enhanced JWT session monitoring and recovery
let sessionWarningTimer = null;
let forceRefreshTimer = null;

// Session monitoring utilities
export const sessionUtils = {
  // Get remaining session time in minutes - FIXED async handling
  getSessionTimeRemaining: async () => {
    try {
      const { data: { session }, error } = await supabase?.auth?.getSession();
      
      if (error) {
        console.warn('Failed to get session for time remaining:', error);
        return 0;
      }
      
      if (!session?.expires_at) return 0;
      
      const expiryTime = new Date(session.expires_at * 1000);
      const currentTime = new Date();
      const remainingMs = expiryTime?.getTime() - currentTime?.getTime();
      
      return Math.max(0, Math.floor(remainingMs / (1000 * 60)));
    } catch (error) {
      console.warn('Failed to get session time remaining:', error);
      return 0;
    }
  },

  // Check if session is near expiry (within 5 minutes) - FIXED async handling
  isSessionNearExpiry: async () => {
    try {
      const remaining = await sessionUtils?.getSessionTimeRemaining();
      return remaining > 0 && remaining <= 5;
    } catch (error) {
      console.warn('Failed to check session expiry:', error);
      return false;
    }
  },

  // Check if session is expired - FIXED async handling
  isSessionExpired: async () => {
    try {
      const remaining = await sessionUtils?.getSessionTimeRemaining();
      return remaining <= 0;
    } catch (error) {
      console.warn('Failed to check if session expired:', error);
      return true;
    }
  },

  // Force refresh session manually with enhanced error handling
  refreshSession: async () => {
    try {
      console.log('🔄 Manually refreshing Supabase session...');
      
      // Check if we have an active session first
      const { data: { session: currentSession }, error: sessionError } = await supabase?.auth?.getSession();
      
      if (sessionError) {
        console.error('❌ Failed to get current session:', sessionError);
        throw new Error(`Session check failed: ${sessionError.message}`);
      }

      if (!currentSession) {
        console.warn('⚠️ No active session to refresh');
        throw new Error('No active session found');
      }

      const { data, error } = await supabase?.auth?.refreshSession();
      
      if (error) {
        console.error('❌ Manual session refresh failed:', error);
        throw new Error(`Session refresh failed: ${error.message}`);
      }
      
      console.log('✅ Session refreshed successfully');
      return data;
    } catch (error) {
      console.error('Session refresh error:', error);
      
      // Dispatch auto-save failure event for UI handling
      window.dispatchEvent(new CustomEvent('supabase-auto-save-failed', {
        detail: { 
          error: error.message,
          timestamp: new Date().toISOString(),
          context: 'Session refresh failure'
        }
      }));
      
      throw error;
    }
  },

  // Start proactive session monitoring with enhanced error handling
  startSessionMonitoring: () => {
    // Clear existing timers
    sessionUtils?.stopSessionMonitoring();

    // Check session every 30 seconds with better error handling
    const checkSession = async () => {
      try {
        // Use getSession() instead of deprecated session property
        const { data: { session }, error } = await supabase?.auth?.getSession();
        
        if (error) {
          console.error('❌ Session check failed:', error);
          window.dispatchEvent(new CustomEvent('supabase-session-check-failed', {
            detail: { 
              error: error.message,
              timestamp: new Date().toISOString()
            }
          }));
          return;
        }

        if (!session) {
          console.warn('⚠️ No active session found');
          return;
        }

        const remaining = await sessionUtils?.getSessionTimeRemaining();
        
        if (remaining <= 0) {
          console.warn('⚠️ JWT token has expired');
          // Try to refresh the session automatically
          await sessionUtils?.refreshSession();
        } else if (remaining <= 5) {
          console.warn(`⚠️ JWT token expires in ${remaining} minutes`);
          // Proactively refresh when 5 minutes remaining
          await sessionUtils?.refreshSession();
        }
      } catch (error) {
        console.error('Session monitoring error:', error);
        // Dispatch session expired event for UI to handle
        window.dispatchEvent(new CustomEvent('supabase-session-expired', {
          detail: { 
            error: error.message,
            timestamp: new Date().toISOString()
          }
        }));
      }
    };

    // Run initial check with delay to allow for proper initialization
    setTimeout(() => {
      checkSession();
    }, 1000);
    
    // Set up recurring check every 30 seconds
    sessionWarningTimer = setInterval(checkSession, 30000);
    
    // Set up aggressive refresh every 45 minutes (before typical 60min expiry)
    forceRefreshTimer = setInterval(async () => {
      try {
        console.log('🔄 Proactive session refresh (45min interval)');
        await sessionUtils?.refreshSession();
      } catch (error) {
        console.error('Proactive refresh failed:', error);
      }
    }, 45 * 60 * 1000);

    console.log('✅ JWT session monitoring started');
  },

  // Stop session monitoring
  stopSessionMonitoring: () => {
    if (sessionWarningTimer) {
      clearInterval(sessionWarningTimer);
      sessionWarningTimer = null;
    }
    if (forceRefreshTimer) {
      clearInterval(forceRefreshTimer);
      forceRefreshTimer = null;
    }
    console.log('🔄 JWT session monitoring stopped');
  },

  // Get session info for debugging with FIXED async handling
  getSessionInfo: async () => {
    try {
      const { data: { session }, error } = await supabase?.auth?.getSession();
      
      if (error) {
        console.warn('Failed to get session info:', error);
        return { 
          status: 'Error retrieving session',
          error: error?.message 
        };
      }
      
      if (!session) {
        return { 
          status: 'No active session',
          note: 'User is not authenticated'
        };
      }

      const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
      const remaining = await sessionUtils?.getSessionTimeRemaining();
      const nearExpiry = await sessionUtils?.isSessionNearExpiry();
      const expired = await sessionUtils?.isSessionExpired();
      
      return {
        status: 'Active',
        expiresAt: expiresAt?.toLocaleString(),
        remainingMinutes: remaining,
        nearExpiry,
        expired,
        accessToken: session?.access_token ? `${session?.access_token?.substring(0, 20)}...` : null,
        lastRefresh: new Date()?.toLocaleString()
      };
    } catch (error) {
      console.error('Failed to get session info:', error);
      return { 
        status: 'Error retrieving session',
        error: error?.message 
      };
    }
  }
};

// Initialize session monitoring when auth state changes
supabase?.auth?.onAuthStateChange(async (event, session) => {
  console.log('🔐 Auth state changed:', event, session ? 'Session active' : 'No session');
  
  if (event === 'SIGNED_IN' && session) {
    // Start monitoring when user signs in
    sessionUtils?.startSessionMonitoring();
    try {
      const sessionInfo = await sessionUtils?.getSessionInfo();
      console.log('📊 Session info:', sessionInfo);
    } catch (error) {
      console.warn('Failed to get initial session info:', error);
    }
  } else if (event === 'SIGNED_OUT') {
    // Stop monitoring when user signs out
    sessionUtils?.stopSessionMonitoring();
  } else if (event === 'TOKEN_REFRESHED' && session) {
    console.log('🔄 Token refreshed successfully');
    try {
      const sessionInfo = await sessionUtils?.getSessionInfo();
      console.log('📊 Updated session info:', sessionInfo);
    } catch (error) {
      console.warn('Failed to get updated session info:', error);
    }
  }
});

// Enhanced error handling utility for database operations
export const handleSupabaseError = (error, context = '') => {
  console.error(`${context ? context + ': ' : ''}`, error);
  
  // Handle JWT expiration specifically
  if (error?.code === 'PGRST303' && error?.message?.includes('JWT expired')) {
    console.warn('🚨 JWT expired error detected');
    
    // Dispatch custom event for UI components to handle
    window.dispatchEvent(new CustomEvent('supabase-jwt-expired', {
      detail: { 
        error: error.message,
        context,
        timestamp: new Date().toISOString()
      }
    }));
    
    return 'Your session has expired. Please refresh the page or log in again.';
  }
  
  // Handle other auth errors
  if (error?.message?.includes('Failed to fetch') || 
      error?.message?.includes('AuthRetryableFetchError')) {
    return 'Cannot connect to the server. Please check your connection and try again.';
  }
  
  // Handle network/connectivity issues
  if (error?.message?.includes('NetworkError') || 
      error?.message?.includes('fetch')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  
  // Default error message
  return error?.message || 'An unexpected error occurred. Please try again.';
};

// Enhanced database operation wrapper with better error handling
export const withSessionRetry = async (operation, context = '', maxRetries = 2) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error?.message);
      
      // Enhanced error detection for various session/auth issues
      const isAuthError = error?.code === 'PGRST303' || error?.message?.includes('JWT expired') ||
                        error?.message?.includes('Failed to fetch') ||
                        error?.message?.includes('AuthRetryableFetchError') ||
                        error?.status === 401;
      
      // If auth error and we have retries left, try to refresh session
      if (isAuthError && attempt < maxRetries) {
        console.log(`🔄 Auth error detected, attempting session refresh (attempt ${attempt}/${maxRetries})`);
        
        try {
          await sessionUtils?.refreshSession();
          console.log('✅ Session refreshed, retrying operation...');
          continue; // Retry the operation
        } catch (refreshError) {
          console.error('❌ Session refresh failed:', refreshError);
          
          // Dispatch auto-save failure event
          window.dispatchEvent(new CustomEvent('supabase-auto-save-failed', {
            detail: { 
              error: `Auto-save failed: ${refreshError.message}`,
              context,
              timestamp: new Date().toISOString(),
              originalError: error.message
            }
          }));
          
          throw refreshError;
        }
      }
      
      // If not auth error or out of retries, throw the error
      if (attempt === maxRetries) {
        // Dispatch final failure event
        window.dispatchEvent(new CustomEvent('supabase-auto-save-failed', {
          detail: { 
            error: `Auto-save failed after ${maxRetries} attempts: ${error.message}`,
            context,
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      throw error;
    }
  }
};

// Export enhanced supabase instance
export { supabase as default };