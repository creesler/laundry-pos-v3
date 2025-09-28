import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, sessionUtils, handleSupabaseError } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [sessionInfo, setSessionInfo] = useState({});
  const [autoSaveStatus, setAutoSaveStatus] = useState({ enabled: true, lastError: null });

  // ✅ REQUIRED: Separate async operations object
  const profileOperations = {
    async load(userId) {
      if (!userId) return;
      setProfileLoading(true);
      try {
        const { data, error } = await supabase
          ?.from('user_profiles')
          ?.select('*')
          ?.eq('id', userId)
          ?.single();
        if (!error) setUserProfile(data);
      } catch (error) {
        console.error('Profile load error:', error);
        const errorMessage = handleSupabaseError(error, 'Loading user profile');
        setSessionError(errorMessage);
      } finally {
        setProfileLoading(false);
      }
    },
    
    clear() {
      setUserProfile(null);
      setProfileLoading(false);
    }
  };

  // ✅ REQUIRED: Protected auth handlers
  const authStateHandlers = {
    // CRITICAL: This MUST remain synchronous
    onChange: (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Clear session error when user successfully authenticates
      if (session?.user) {
        setSessionError(null);
        setAutoSaveStatus(prev => ({ ...prev, lastError: null }));
        profileOperations?.load(session?.user?.id); // Fire-and-forget
        
        // Update session info for debugging
        setTimeout(() => {
          setSessionInfo(sessionUtils?.getSessionInfo());
        }, 1000);
      } else {
        profileOperations?.clear();
        setSessionInfo({});
      }
    }
  };

  useEffect(() => {
    // Enhanced session initialization with better error handling
    const initializeSession = async () => {
      try {
        const { data: { session }, error } = await supabase?.auth?.getSession();
        if (error) {
          console.error('Failed to get initial session:', error);
          setSessionError(`Failed to fetch current session: ${error?.message}`);
        } else {
          authStateHandlers?.onChange(null, session);
        }
      } catch (error) {
        console.error('Session initialization error:', error);
        setSessionError(`Failed to fetch current session: ${error?.message}`);
        setLoading(false);
      }
    };

    initializeSession();

    // PROTECTED: Never modify this callback signature
    const { data: { subscription } } = supabase?.auth?.onAuthStateChange(
      authStateHandlers?.onChange
    );

    // Enhanced session monitoring event listeners
    const handleJWTExpired = (event) => {
      console.log('🚨 JWT expired event received:', event?.detail);
      setSessionError('Your session has expired. Please refresh the page or log in again.');
      setAutoSaveStatus(prev => ({ ...prev, enabled: false, lastError: 'JWT expired' }));
    };

    const handleSessionExpired = (event) => {
      console.log('🚨 Session expired event received:', event?.detail);
      setSessionError('Your session has expired. Please log in again.');
      setAutoSaveStatus(prev => ({ ...prev, enabled: false, lastError: 'Session expired' }));
    };

    const handleAutoSaveFailed = (event) => {
      console.log('🚨 Auto-save failed event received:', event?.detail);
      setAutoSaveStatus(prev => ({ 
        ...prev, 
        enabled: false, 
        lastError: event?.detail?.error || 'Auto-save failed'
      }));
      setSessionError(event?.detail?.error || 'Auto-save functionality is currently unavailable.');
    };

    const handleSessionCheckFailed = (event) => {
      console.log('🚨 Session check failed event received:', event?.detail);
      setSessionError(`Failed to fetch current session: ${event?.detail?.error || 'TypeError: Failed to fetch'}`);
      setAutoSaveStatus(prev => ({ ...prev, enabled: false, lastError: 'Session check failed' }));
    };

    // Listen for session-related events
    window.addEventListener('supabase-jwt-expired', handleJWTExpired);
    window.addEventListener('supabase-session-expired', handleSessionExpired);
    window.addEventListener('supabase-auto-save-failed', handleAutoSaveFailed);
    window.addEventListener('supabase-session-check-failed', handleSessionCheckFailed);

    // Periodic session info update (every 60 seconds) with FIXED async handling
    const sessionInfoInterval = setInterval(async () => {
      if (user) {
        try {
          const sessionInfo = await sessionUtils?.getSessionInfo();
          setSessionInfo(sessionInfo);
        } catch (error) {
          console.error('Failed to update session info:', error);
        }
      }
    }, 60000);

    return () => {
      subscription?.unsubscribe();
      window.removeEventListener('supabase-jwt-expired', handleJWTExpired);
      window.removeEventListener('supabase-session-expired', handleSessionExpired);
      window.removeEventListener('supabase-auto-save-failed', handleAutoSaveFailed);
      window.removeEventListener('supabase-session-check-failed', handleSessionCheckFailed);
      clearInterval(sessionInfoInterval);
    };
  }, [user]);

  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setSessionError(null);
      
      const { data, error } = await supabase?.auth?.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        const errorMessage = handleSupabaseError(error, 'Sign in failed');
        setSessionError(errorMessage);
        throw new Error(errorMessage);
      }
      
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, metadata = {}) => {
    try {
      setLoading(true);
      setSessionError(null);
      
      const { data, error } = await supabase?.auth?.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });
      
      if (error) {
        const errorMessage = handleSupabaseError(error, 'Sign up failed');
        setSessionError(errorMessage);
        throw new Error(errorMessage);
      }
      
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setSessionError(null);
      const { error } = await supabase?.auth?.signOut();
      if (error) throw error;
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Sign out failed');
      setSessionError(errorMessage);
      throw error;
    }
  };

  const clearSessionError = () => {
    setSessionError(null);
    setAutoSaveStatus(prev => ({ ...prev, lastError: null }));
  };

  const refreshSession = async () => {
    try {
      setSessionError(null);
      setAutoSaveStatus(prev => ({ ...prev, lastError: null }));
      const result = await sessionUtils?.refreshSession();
      const sessionInfo = await sessionUtils?.getSessionInfo();
      setSessionInfo(sessionInfo);
      setAutoSaveStatus(prev => ({ ...prev, enabled: true }));
      return result;
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Session refresh failed');
      setSessionError(errorMessage);
      setAutoSaveStatus(prev => ({ ...prev, enabled: false, lastError: errorMessage }));
      throw error;
    }
  };

  const retryAutoSave = async () => {
    try {
      setAutoSaveStatus(prev => ({ ...prev, lastError: null }));
      await refreshSession();
      setAutoSaveStatus(prev => ({ ...prev, enabled: true }));
    } catch (error) {
      console.error('Auto-save retry failed:', error);
    }
  };

  const value = {
    user,
    userProfile,
    loading,
    profileLoading,
    sessionError,
    sessionInfo,
    autoSaveStatus,
    signIn,
    signUp,
    signOut,
    clearSessionError,
    refreshSession,
    retryAutoSave
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};