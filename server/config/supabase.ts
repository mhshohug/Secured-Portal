import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: Supabase URL or Key is not configured. Database operations will fail unless configured.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});
