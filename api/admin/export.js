import { getServiceClient } from '../_lib/supabase.js';
import { sendError, methodNotAllowed } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { isValidUuid } from '../_lib/validation.js';

function slugify(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'event';
}

export function escapeCsvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
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

  const eventId = typeof req.query?.event_id === 'string' ? req.query.event_id.trim() : '';
  if (!isValidUuid(eventId)) {
    return sendError(res, 404, 'event_not_found', 'Event not found.');
  }

  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', eventId)
    .maybeSingle();

  if (eventErr) {
    console.error('export event lookup error:', eventErr.code, eventErr.message);
    return sendError(res, 500, 'server_error', 'Database error.');
  }

  if (!eventRow) {
    return sendError(res, 404, 'event_not_found', 'Event not found.');
  }

  const { data: rows, error: rowsErr } = await supabase
    .from('registrations')
    .select('ticket_id, full_name, email, organization, contact_number, created_at, checked_in, checked_in_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (rowsErr) {
    console.error('export rows error:', rowsErr.code, rowsErr.message);
    return sendError(res, 500, 'server_error', 'Database error.');
  }

  const headers = [
    'ticket_id',
    'full_name',
    'email',
    'organization',
    'contact_number',
    'registered_at',
    'checked_in',
    'checked_in_at',
  ];

  const lines = [headers.join(',')];
  for (const row of rows || []) {
    const cells = [
      row.ticket_id,
      row.full_name,
      row.email,
      row.organization,
      row.contact_number,
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.checked_in ? 'true' : 'false',
      row.checked_in_at ? new Date(row.checked_in_at).toISOString() : '',
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
  }

  const csv = `\uFEFF${lines.join('\r\n')}`;
  const filename = `registrations-${slugify(eventRow.title)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
}
