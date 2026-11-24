import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const raw = req.body?.ticket_id;
  const ticket_id = typeof raw === 'string' ? raw.trim().toUpperCase() : '';

  if (!ticket_id) {
    res.status(400).json({ status: 'invalid', message: 'ticket_id is required' });
    return;
  }

  const { data: row, error: lookupErr } = await supabase
    .from('registrations')
    .select('id, ticket_id, full_name, organization, checked_in, checked_in_at')
    .eq('ticket_id', ticket_id)
    .single();

  if (lookupErr && lookupErr.code === 'PGRST116') {
    res.status(404).json({ status: 'not_found', message: 'Ticket ID not found' });
    return;
  }
  if (lookupErr) {
    res.status(500).json({ status: 'error', message: 'Database error' });
    return;
  }

  if (row.checked_in) {
    res.status(200).json({
      status: 'already_checked_in',
      ticket_id: row.ticket_id,
      full_name: row.full_name,
      organization: row.organization,
      checked_in_at: row.checked_in_at
    });
    return;
  }

  const checked_in_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('registrations')
    .update({ checked_in: true, checked_in_at })
    .eq('id', row.id);

  if (updateErr) {
    res.status(500).json({ status: 'error', message: 'Failed to update check-in' });
    return;
  }

  res.status(200).json({
    status: 'checked_in',
    ticket_id: row.ticket_id,
    full_name: row.full_name,
    organization: row.organization,
    checked_in_at
  });
}
