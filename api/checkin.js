import { getServiceClient } from './_lib/supabase.js';
import { sendError, methodNotAllowed } from './_lib/http.js';
import { requireAdmin } from './_lib/auth.js';
import { isValidUuid, normalizeTicketId } from './_lib/validation.js';

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
    return sendError(res, 422, 'validation_error', 'Invalid check-in request.', fields);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('registrations')
    .update({ checked_in: true, checked_in_at: nowIso })
    .eq('ticket_id', ticketId)
    .eq('event_id', eventId)
    .eq('checked_in', false)
    .select('ticket_id, full_name, organization, checked_in_at')
    .maybeSingle();

  if (updateErr) {
    console.error('checkin update error:', updateErr.code, updateErr.message);
    return sendError(res, 500, 'server_error', 'Failed to update check-in.');
  }

  if (updated) {
    return res.status(200).json({
      status: 'checked_in',
      ticket_id: updated.ticket_id,
      full_name: updated.full_name,
      organization: updated.organization,
      checked_in_at: updated.checked_in_at,
    });
  }

  const { data: existing, error: lookupErr } = await supabase
    .from('registrations')
    .select('event_id, ticket_id, full_name, organization, checked_in, checked_in_at')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (lookupErr) {
    console.error('checkin lookup error:', lookupErr.code, lookupErr.message);
    return sendError(res, 500, 'server_error', 'Database error.');
  }

  if (!existing) {
    return sendError(res, 404, 'ticket_not_found', 'Ticket not found.');
  }

  if (existing.event_id !== eventId) {
    return sendError(res, 409, 'wrong_event', 'Ticket is for a different event.');
  }

  return res.status(200).json({
    status: 'already_checked_in',
    ticket_id: existing.ticket_id,
    full_name: existing.full_name,
    organization: existing.organization,
    checked_in_at: existing.checked_in_at,
  });
}
