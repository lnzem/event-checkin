import { getSupabase } from './supabase-client.js';

export class ApiError extends Error {
  constructor({ status, code, message, fields = null }) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'error';
    this.fields = fields;
  }
}

let unauthorizedHandler = null;

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {}, responseType = 'json' } = {}) {
  const reqHeaders = { ...headers };

  if (body !== undefined && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        reqHeaders.Authorization = `Bearer ${token}`;
      }
    } catch {
      // No session available
    }
  }

  const res = await fetch(path, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  // 401 means the session is missing or expired. A 403 means the user is
  // signed in but lacks permission, so it must not clear a valid session.
  if (res.status === 401 && typeof unauthorizedHandler === 'function') {
    unauthorizedHandler(res.status);
  }

  if (!res.ok) {
    let errData = {};
    try {
      errData = await res.json();
    } catch {
      errData = { code: 'http_error', message: res.statusText || 'Request failed' };
    }
    throw new ApiError({
      status: res.status,
      code: errData.code || 'http_error',
      message: errData.message || 'Request failed',
      fields: errData.fields || null,
    });
  }

  if (responseType === 'blob') {
    return { blob: await res.blob(), headers: res.headers };
  }
  if (responseType === 'text') {
    return res.text();
  }
  return res.json();
}
