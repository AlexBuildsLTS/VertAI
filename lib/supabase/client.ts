import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { ExpoSecureStoreAdapter } from './secureStorage';
import { Database } from '../../types/database/database.types';

// GUARANTEED FALLBACK: This ensures that if the Expo APK build strips your .env variables,
// the app still has the explicit URL and Key to reach the internet, preventing the silent crash.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jhcgkqzjabsitfilajuh.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoY2drcXpqYWJzaXRmaWxhanVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUxOTIsImV4cCI6MjA4OTQzMTE5Mn0.5tTsWTYNzDOyf6Evf2EXiJ2dhvpuRfixuGiMt1evHgA';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env file.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Production standard: 
    // On native (iOS/Android), use Expo Secure Store.
    // On web, omit the storage key to let Supabase use its highly-tested default browser storage.
    ...(Platform.OS !== 'web' ? { storage: ExpoSecureStoreAdapter } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});