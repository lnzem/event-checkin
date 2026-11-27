import { getServiceClient } from './_lib/supabase.js';
import { sendError, methodNotAllowed } from './_lib/http.js';
import { getAuthUser } from './_lib/auth.js';
import { normalizeEmail, validateRegistrationInput } from './_lib/validation.js';
import { generateTicketId, generateQrAssets } from './_lib/qr.js';
import { checkRateLimit, getClientIp } from './_lib/rate-limit.js';
import { sendTicketsEmail } from './_lib/email.js';

const MAX_TICKET_RETRIES = 5;

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) return true;
  if (!token || typeof token !== 'string') return false;

  try {
    const form = new URLSearchParams({
      secret,
      response: token,
      remoteip: ip,
    });
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

function mapRpcError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('event_not_found')) return { status: 404, code: 'event_not_found', message: 'Event not found.' };
  if (msg.includes('event_closed')) return { status: 403, code: 'event_closed', message: 'Registration for this event is closed.' };
  if (msg.includes('event_full')) return { status: 409, code: 'event_full', message: 'This event is already full.' };
  if (msg.includes('duplicate_registration')) {
    return { status: 409, code: 'duplicate_registration', message: 'This email is already registered for this event.' };
  }
  if (msg.includes('ticket_collision')) return { status: 500, code: 'ticket_collision', message: 'Could not allocate ticket ID.' };
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(`register:ip:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSeconds));
    return sendError(res, 429, 'rate_limited', 'Too many attempts. Please wait a minute and try again.');
  }

  const { valid, fields, data } = validateRegistrationInput(req.body);
  if (!valid) {
    return sendError(res, 422, 'validation_error', 'Please fix the highlighted fields.', fields);
  }

  const turnstileOk = await verifyTurnstile(req.body?.turnstile_token, ip);
  if (!turnstileOk) {
    return sendError(res, 422, 'validation_error', 'Please complete the verification challenge.', {
      captcha: 'Verification failed. Please try again.',
    });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('Supabase config error:', err.message);
    return sendError(res, 500, 'server_error', 'Server configuration error.');
  }

  const authUser = await getAuthUser(req, supabase);
  let userId = null;
  if (authUser) {
    if (data.email !== normalizeEmail(authUser.email)) {
      return sendError(res, 422, 'validation_error', 'Please fix the highlighted fields.', {
        email: 'Use the email of your account.',
      });
    }
    userId = authUser.id;
  }

  let reg = null;
  let lastMapped = null;

  for (let attempt = 0; attempt < MAX_TICKET_RETRIES; attempt += 1) {
    const ticketId = generateTicketId();
    const { data: rpcData, error: rpcErr } = await supabase.rpc('register_for_event', {
      p_event_id: data.event_id,
      p_user_id: userId,
      p_full_name: data.full_name,
      p_email: data.email,
      p_organization: data.organization,
      p_contact_number: data.contact_number,
      p_ticket_id: ticketId,
    });

    if (!rpcErr && rpcData) {
      reg = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      break;
    }

    const mapped = mapRpcError(rpcErr);
    if (!mapped) {
      console.error('register_for_event failed:', rpcErr?.code, rpcErr?.message);
      return sendError(res, 500, 'server_error', 'Failed to complete registration.');
    }

    lastMapped = mapped;
    if (mapped.code !== 'ticket_collision') {
      return sendError(res, mapped.status, mapped.code, mapped.message);
    }
  }

  if (!reg) {
    return sendError(
      res,
      lastMapped?.status || 500,
      lastMapped?.code || 'server_error',
      lastMapped?.message || 'Failed to allocate ticket ID.'
    );
  }

  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('title, starts_at, ends_at, venue')
    .eq('id', data.event_id)
    .single();

  if (eventErr || !eventRow) {
    console.error('Failed to load event after registration:', eventErr?.message);
    return sendError(res, 500, 'server_error', 'Registration created but event details could not be loaded.');
  }

  const { qrDataUrl, qrBuffer } = await generateQrAssets(reg.ticket_id);

  let qrSent = false;
  try {
    const emailResult = await sendTicketsEmail({
      to: reg.email,
      attendeeName: reg.full_name,
      tickets: [
        {
          ticket_id: reg.ticket_id,
          full_name: reg.full_name,
          qrBuffer,
          event: eventRow,
        },
      ],
    });
    if (emailResult.sent) {
      await supabase.from('registrations').update({ qr_sent: true }).eq('id', reg.id);
      qrSent = true;
    }
  } catch (err) {
    console.error('Resend email error (non-fatal):', err?.message || err);
  }

  return res.status(201).json({
    ticket_id: reg.ticket_id,
    full_name: reg.full_name,
    qr_data_url: qrDataUrl,
    qr_sent: qrSent,
    event: {
      title: eventRow.title,
      starts_at: eventRow.starts_at,
      venue: eventRow.venue,
    },
  });
}
