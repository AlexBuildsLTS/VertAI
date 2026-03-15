import 'react-native-url-polyfill/auto'; // REQUIRED for Supabase in React Native
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../types/database/database.types';

// DO NOT USE process.env HERE. It will crash Expo Web.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env file.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // You will likely swap this for secureStorage later, but let's get it booting first
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
