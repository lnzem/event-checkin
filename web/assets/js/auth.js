import { getSupabase } from './supabase-client.js';

export function safeNext(url, fallback = '/tickets') {
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function getSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

export async function getProfile() {
  const session = await getSession();
  if (!session?.user) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, organization, contact_number, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function claimMyRegistrations() {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('claim_my_registrations');
  if (error) throw error;
  return Number(data || 0);
}

export async function requireUser() {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
    return null;
  }
  return session;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/admin/login?next=${next}`);
    return null;
  }
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/admin/login?next=${next}`);
    return null;
  }
  return { session, profile };
}

export async function signOut(redirectTo = '/') {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  window.location.assign(redirectTo);
}
