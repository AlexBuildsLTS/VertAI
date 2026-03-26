/**
 *  Supabase configuration and utilities
 * # Environment variable loader
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');


}

/**
 * Helper to check if Supabase is properly configured
 */
export const isSupabaseConfigured = () => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

 
