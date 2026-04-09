/**
 * store/useAuthStore.ts
 * Verbum NorthOS - Enterprise Authentication State Manager (Production Ready)
 * Optimized for 2026 High-Performance Standards
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { Database } from '../types/database/database.types';
import { Platform } from 'react-native';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, username?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  initialize: () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  clearError: () => set({ error: null }),

  signInWithPassword: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    if (__DEV__) console.log(`[Auth Store] 🔐 Attempting sign-in: ${email}`);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (__DEV__) console.warn(`[Auth Store] Sign-in error:`, error.message);
        throw error;
      }

      if (__DEV__) console.log(`[Auth Store] ✅ Sign-in successful: ${data.user?.email}`);
      set({ session: data.session, user: data.user });
      await get().refreshProfile();

      return { error: null };
    } catch (err: unknown) {
      const authError = err as AuthError;
      const msg = authError?.message || 'Invalid credentials.';
      set({ error: msg, isLoading: false });
      return { error: msg };
    }
  },

  signUp: async (email: string, password: string, fullName: string, username?: string) => {
    set({ isLoading: true, error: null });
    if (__DEV__) console.log(`[Auth Store] 📝 Attempting sign-up: ${email}`);

    try {
      // 2026 Compliance: Use user_metadata for atomic profile creation in Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            username: username || email.split('@')[0],
          },
          emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined
        },
      });

      if (error) {
        if (__DEV__) console.warn(`[Auth Store] ❌ Sign-up error:`, error.message);
        throw error;
      }

      if (__DEV__) console.log(`[Auth Store] 📬 Sign-up request processed. Session: ${!!data.session}`);

      if (data.session) {
        set({ session: data.session, user: data.user });
        await get().refreshProfile();
      }

      return { error: null };
    } catch (err: unknown) {
      const authError = err as AuthError;
      // Handle "User already registered" gracefully for 2026 UX
      const msg = authError?.message || 'Registration failed.';
      set({ error: msg, isLoading: false });
      return { error: msg };
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, error: null, isLoading: false });
  },

  refreshProfile: async () => {
    const { session } = get();
    const userId = session?.user?.id;

    if (!userId) {
      set({ profile: null });
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
        if (error.message.includes('recursion')) {
          set({ error: 'Security Policy Loop Detected. Check RLS.' });
        }
        return;
      }

      if (data) {
        set({ profile: data as Profile, error: null, isLoading: false });
      } else {
        // Handle case where profile isn't created yet (trigger-based delay)
        if (__DEV__) console.log('[Auth Kernel] ⏳ Profile not found yet, retrying in 1s...');
        setTimeout(() => get().refreshProfile(), 1000);
      }
    } catch (err: unknown) {
      const dbError = err as Error;
      if (__DEV__) console.error('[Auth Kernel] 🚨 Critical Store Crash:', dbError.message);
      set({ profile: null, isLoading: false });
    }
  },

  initialize: () => {
    if (__DEV__) console.log('[Auth Kernel] 🚀 Initializing...');

    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, isInitialized: true });

      if (session?.user) {
        get().refreshProfile();
      } else {
        set({ isLoading: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (__DEV__) console.log(`[Auth Kernel] ⚡ Event: ${event}`);

      set({ session, user: session?.user ?? null });

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        get().refreshProfile();
      } else if (event === 'SIGNED_OUT') {
        set({ profile: null, isLoading: false });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  },
}));
