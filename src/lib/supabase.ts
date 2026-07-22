import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const envUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const envKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (envUrl && envKey) {
  supabaseInstance = createClient(envUrl, envKey, {
    auth: { persistSession: false },
  });
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabaseInstance) return supabaseInstance;

  try {
    const res = await fetch('/api/config/supabase');
    if (res.ok) {
      const config = await res.json();
      if (config.url && config.key) {
        supabaseInstance = createClient(config.url, config.key, {
          auth: { persistSession: false },
        });
        return supabaseInstance;
      }
    }
  } catch (err) {
    console.error('Failed to load Supabase config from server:', err);
  }
  return null;
}
