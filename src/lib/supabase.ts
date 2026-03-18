import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const fallbackSupabaseUrl = `https://${projectId}.supabase.co`;
const fallbackLooksInvalid = fallbackSupabaseUrl.includes('zsrchwyircfwdptulurj');

export const supabaseConfigError =
  !envSupabaseUrl || !envSupabaseAnonKey
    ? `Missing Supabase environment variables. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
    : fallbackLooksInvalid && envSupabaseUrl === fallbackSupabaseUrl
      ? `The configured Supabase URL still points to the invalid fallback project (${fallbackSupabaseUrl}). Replace it with your real project URL in .env.`
      : '';

export const supabase = supabaseConfigError
  ? null
  : createClient(envSupabaseUrl, envSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export const SUPABASE_STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'project-assets';
