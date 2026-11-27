import { sendError } from './http.js';

export async function getAuthUser(req, supabase) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== 'string') return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const jwt = match[1].trim();
  if (!jwt) return null;

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return null;

  return data.user;
}

export async function requireAdmin(req, res, supabase) {
  const user = await getAuthUser(req, supabase);
  if (!user) {
    sendError(res, 401, 'unauthorized', 'Authentication required.');
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Admin profile lookup error:', error.code, error.message);
    sendError(res, 500, 'server_error', 'Could not verify admin access.');
    return null;
  }

  if (!profile || profile.role !== 'admin') {
    sendError(res, 403, 'forbidden', 'Admin access required.');
    return null;
  }

  return user;
}
