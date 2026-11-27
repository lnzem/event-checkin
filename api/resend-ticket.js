import { getServiceClient } from './_lib/supabase.js';
import { sendError, methodNotAllowed } from './_lib/http.js';
import { isValidEmail, normalizeEmail } from './_lib/validation.js';
import { generateQrAssets } from './_lib/qr.js';
import { checkRateLimit, getClientIp } from './_lib/rate-limit.js';
import { sendTicketsEmail } from './_lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(`resend:ip:${ip}`, 3, 60_000);
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfterSeconds));
    return sendError(res, 429, 'rate_limited', 'Too many requests. Please wait a minute and try again.');
  }

  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(200).json({ ok: true });
  }

  const emailLimit = checkRateLimit(`resend:email:${email}`, 1, 60_000);
  if (!emailLimit.allowed) {
    // Apply per-email rate limit silently to prevent enumeration
    return res.status(200).json({ ok: true });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('Supabase config error:', err.message);
    return res.status(200).json({ ok: true });
  }

  try {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await supabase
      .from('registrations')
      .select('id, ticket_id, full_name, email, events!inner(id, title, starts_at, ends_at, venue, status)')
      .eq('email', email)
      .eq('events.status', 'published')
      .gt('events.ends_at', nowIso);

    if (error || !rows || rows.length === 0) {
      return res.status(200).json({ ok: true });
    }

    const tickets = await Promise.all(
      rows.map(async (row) => {
        const { qrBuffer } = await generateQrAssets(row.ticket_id);
        return {
          id: row.id,
          ticket_id: row.ticket_id,
          full_name: row.full_name,
          qrBuffer,
          event: row.events,
        };
      })
    );

    const emailResult = await sendTicketsEmail({
      to: email,
      attendeeName: rows[0].full_name,
      tickets,
    });

    if (emailResult.sent) {
      await supabase
        .from('registrations')
        .update({ qr_sent: true })
        .in('id', rows.map((r) => r.id));
    }
  } catch (err) {
    console.error('resend-ticket error (non-fatal):', err?.message || err);
  }

  return res.status(200).json({ ok: true });
}
