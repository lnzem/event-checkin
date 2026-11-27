import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let client = null;

export function getSupabase() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase client is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in /web/assets/js/config.js.');
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? getSupabase()
  : null;
