const buckets = new Map();
let lastPrune = Date.now();

export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Simple sliding-window in-memory rate limiter.
 * Returns { allowed: boolean, retryAfterSeconds: number }.
 */
export function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (now - lastPrune > 60_000) {
    for (const [k, timestamps] of buckets.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
    lastPrune = now;
  }

  const existing = buckets.get(key) || [];
  const recent = existing.filter((t) => t > cutoff);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}
