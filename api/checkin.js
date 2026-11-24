import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase configuration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    res.status(500).json({ message: 'Server configuration error' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  let supabaseUrl;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  try {
    supabaseUrl = new URL(process.env.SUPABASE_URL.trim()).origin;
  } catch {
    console.error('Invalid SUPABASE_URL configuration');
    res.status(500).json({ message: 'Server configuration error' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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
    console.error('Database error during ticket lookup:', {
      code: lookupErr.code,
      message: lookupErr.message,
      details: lookupErr.details,
      hint: lookupErr.hint
    });
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
    console.error('Database error during checkin update:', {
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
      hint: updateErr.hint
    });
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
