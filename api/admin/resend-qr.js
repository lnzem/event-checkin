import { getServiceClient } from '../_lib/supabase.js';
import { sendError, methodNotAllowed } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { normalizeTicketId } from '../_lib/validation.js';
import { generateQrAssets } from '../_lib/qr.js';
import { sendTicketsEmail } from '../_lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('Supabase config error:', err.message);
    return sendError(res, 500, 'server_error', 'Server configuration error.');
  }

  const admin = await requireAdmin(req, res, supabase);
  if (!admin) return;

  const ticketId = normalizeTicketId(req.body?.ticket_id);
  if (!ticketId) {
    return sendError(res, 422, 'validation_error', 'Ticket ID is required.', {
      ticket_id: 'Ticket ID is required.',
    });
  }

  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, ticket_id, full_name, email, events(title, starts_at, ends_at, venue)')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (error) {
    console.error('resend-qr lookup error:', error.code, error.message);
    return sendError(res, 500, 'server_error', 'Database error.');
  }

  if (!reg || !reg.events) {
    return sendError(res, 404, 'ticket_not_found', 'Ticket not found.');
  }

  const { qrBuffer } = await generateQrAssets(reg.ticket_id);

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
          event: reg.events,
        },
      ],
    });
    if (emailResult.sent) {
      await supabase.from('registrations').update({ qr_sent: true }).eq('id', reg.id);
      qrSent = true;
    }
  } catch (err) {
    console.error('resend-qr email error:', err?.message || err);
  }

  return res.status(200).json({ ok: true, qr_sent: qrSent });
}
