import { createClient } from '@supabase/supabase-js';

export function getServiceClient() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(rawUrl).origin;
  } catch {
    throw new Error('Invalid SUPABASE_URL');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
