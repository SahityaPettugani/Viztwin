import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const env = import.meta.env as Record<string, string | undefined>;

const envSupabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.NEXT_PUBLIC_workingbranch_SUPABASE_URL ||
  '';

const envSupabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.workingbranch_SUPABASE_ANON_KEY ||
  '';

const fallbackSupabaseUrl = `https://${projectId}.supabase.co`;
const fallbackLooksInvalid = fallbackSupabaseUrl.includes('zsrchwyircfwdptulurj');

export const supabaseConfigError =
  !envSupabaseUrl || !envSupabaseAnonKey
    ? 'Missing Supabase environment variables. Create a .env file with VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY.'
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
  env.VITE_SUPABASE_STORAGE_BUCKET || env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'project-assets';
