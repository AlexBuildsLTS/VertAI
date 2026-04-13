/**
 * store/useAuthStore.ts
 * VeraxAI - Authentication State Manager
 * WEB / APK
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { Database } from '../types/database/database.types';
import { Platform } from 'react-native';

/**
 * [CRITICAL ROUTER LOCK]
 * Temporarily blinds the global store from broadcasting session changes to Expo Router.
 * This provides the UI (sign-in.tsx) exactly enough time to play smooth success
 * animations (Checkmarks, etc.) without the layout violently unmounting them.
 */
let authUIRoutingLock = false;

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: (targetUserId?: string | number, currentRetry?: number) => Promise<void>;
  initialize: () => () => void;
  clearError: () => void;
}

/**
 * Translates raw Supabase/network errors into user-facing messages.
 */
const interceptAuthError = (err: any, defaultMessage: string): string => {
  const msg = err?.message || '';

  if (msg.includes('Unexpected character: <') || msg.includes('JSON Parse error')) {
    if (__DEV__) console.warn('[Auth Interceptor] ⚠️ Received HTML instead of JSON.');
    return 'Network Protocol Error: The authentication gateway is misconfigured.';
  }
  if (msg.includes('unexpected_failure') || msg.includes('500')) {
    if (__DEV__) console.error('[Auth Interceptor] 🚨 Backend Trigger Failure:', msg);
    return 'System fault: Identity generation failed on the server.';
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
    if (__DEV__) console.error('[Auth Interceptor] 🌐 Network Issue:', msg);
    return 'Neural link failed. Cannot reach the authentication server.';
  }

  return msg || defaultMessage;
};

/**
 * Strips invisible characters from env URLs that crash Android OkHttp.
 */
const sanitizeUrl = (url: string | undefined): string => {
  if (!url) return 'https://jhcgkqzjabsitfilajuh.supabase.co';
  return url.replace(/[\s\n\r]+$/g, '').replace(/\/$/, '');
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  clearError: () => set({ error: null }),

  /**
   * Email/password sign-in.
   * FIX: Removed 'await' on profile fetch & added UI lock so the button animation can play!
   */
  signInWithPassword: async (email: string, password: string) => {
    // Note: We DO NOT set global isLoading: true here. The local UI handles its own spinners.
    // Setting global isLoading causes _layout.tsx to render black fallback screens.
    set({ error: null });
    authUIRoutingLock = true;

    if (__DEV__) console.log(`[Auth Store] 🔐 Attempting sign-in: ${email}`);

    try {
      const safeUrl = sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
      if (__DEV__ && Platform.OS !== 'web') {
        console.log(`[Auth Store] Native URL Check: -> ${safeUrl} <-`);
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (__DEV__) console.log(`[Auth Store] ✅ Sign-in successful: ${data.user?.email}`);

      // Fetch profile asynchronously (DO NOT AWAIT).
      get().refreshProfile(data.user?.id);

      // Delay broadcasting the session to the Global Router by 1500ms.
      // This perfectly syncs with the `sign-in.tsx` "Access Granted" animation.
      setTimeout(() => {
        set({ session: data.session, user: data.user });
        authUIRoutingLock = false;
      }, 1500);

      // Return instantly so the UI can show the Green Checkmark!
      return { error: null };
    } catch (err: unknown) {
      authUIRoutingLock = false;
      const mappedError = interceptAuthError(err, 'Invalid credentials.');
      set({ error: mappedError });
      return { error: mappedError };
    }
  },

  /**
   * Email/password registration.
   */
  signUp: async (email: string, password: string, fullName: string) => {
    authUIRoutingLock = true;
    set({ error: null });

    if (__DEV__) console.log(`[Auth Store] 📝 Attempting sign-up: ${email}`);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
        },
      });

      if (error) throw error;

      if (__DEV__) console.log(`[Auth Store] 📬 Sign-up processed.`);

      // Purge the auto-session silently
      if (data.session) {
        if (__DEV__) console.log('[Auth Store] 🛡️ Auto-session detected. Purging...');
        await supabase.auth.signOut();
      }

      // Delay releasing the lock to let UI sign-up animation play
      setTimeout(() => {
        authUIRoutingLock = false;
      }, 2000);

      return { error: null };
    } catch (err: unknown) {
      authUIRoutingLock = false;
      const mappedError = interceptAuthError(err, 'Registration failed. Identity may already exist.');
      set({ error: mappedError });
      return { error: mappedError };
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (__DEV__) console.warn('[Auth Store] Sign out network error safely caught.');
    } finally {
      set({ user: null, session: null, profile: null, error: null, isLoading: false });
    }
  },

  /**
   * Fetches the user profile from Supabase.
   * Supports explicit User ID to handle delayed session broadcasts.
   */
  refreshProfile: async (targetUserId?: string | number, currentRetry = 0) => {
    const retryCount = typeof targetUserId === 'number' ? targetUserId : currentRetry;
    const userId = (typeof targetUserId === 'string' ? targetUserId : undefined) || get().session?.user?.id;

    if (!userId) {
      set({ profile: null, isLoading: false });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (__DEV__) console.warn(`[Auth Kernel] ⚠️ Sync Error: ${error.message}`);
        set({ error: interceptAuthError(error, 'Profile sync failed.'), isLoading: false });
        return;
      }

      if (data) {
        set({ profile: data as Profile, error: null, isLoading: false });
      } else if (retryCount < 3) {
        if (__DEV__) console.log(`[Auth Kernel] ⏳ Profile propagating, retry ${retryCount + 1}/3...`);
        setTimeout(() => get().refreshProfile(targetUserId, retryCount + 1), 1000);
      } else {
        if (__DEV__) console.warn('[Auth Kernel] ⚠️ Profile not found after 3 retries. Proceeding.');
        set({ isLoading: false });
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('[Auth Kernel] 🚨 Non-fatal Store Error:', err);
      set({ profile: null, isLoading: false, error: interceptAuthError(err, 'Critical sync failure') });
    }
  },

  /**
   * Bootstraps the auth session on app launch.
   */
  initialize: () => {
    if (__DEV__) console.log('[Auth Kernel] 🚀 Initializing Auth Matrix...');

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        if (__DEV__) console.warn('[Auth Kernel] Session boundary:', error.message);
      }

      set({ session, user: session?.user ?? null, isInitialized: true });

      if (session?.user) {
        get().refreshProfile();
      } else {
        set({ isLoading: false });
      }
    }).catch(err => {
      if (__DEV__) console.warn('[Auth Kernel] Initialization trap caught:', err?.message);
      set({ isInitialized: true, isLoading: false, session: null, user: null });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Blind the store during UI animations to prevent premature layout unmounting
      if (authUIRoutingLock) {
        if (__DEV__) console.log(`[Auth Kernel] 🔒 Ignoring event ${event} to protect UI animations.`);
        return;
      }

      if (__DEV__) console.log(`[Auth Kernel] ⚡ Event: ${event}`);

      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        set({ session: null, user: null, profile: null, isLoading: false });
        return;
      }

      set({ session, user: session?.user ?? null });

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        get().refreshProfile();
      } else if (event === 'SIGNED_OUT') {
        set({ profile: null, isLoading: false, error: null });
      }
    });

    return () => subscription.unsubscribe();
  },
}));