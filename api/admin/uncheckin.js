import { getServiceClient } from '../_lib/supabase.js';
import { sendError, methodNotAllowed } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { isValidUuid, normalizeTicketId } from '../_lib/validation.js';

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
  const eventId = typeof req.body?.event_id === 'string' ? req.body.event_id.trim() : '';

  const fields = {};
  if (!ticketId) fields.ticket_id = 'Ticket ID is required.';
  if (!isValidUuid(eventId)) fields.event_id = 'A valid event ID is required.';
  if (Object.keys(fields).length > 0) {
    return sendError(res, 422, 'validation_error', 'Invalid request.', fields);
  }

  const { data: updated, error } = await supabase
    .from('registrations')
    .update({ checked_in: false, checked_in_at: null })
    .eq('ticket_id', ticketId)
    .eq('event_id', eventId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('uncheckin error:', error.code, error.message);
    return sendError(res, 500, 'server_error', 'Failed to undo check-in.');
  }

  if (!updated) {
    return sendError(res, 404, 'ticket_not_found', 'Ticket not found for this event.');
  }

  return res.status(200).json({ ok: true });
}
