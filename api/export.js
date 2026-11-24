import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const key = req.query.key;
  if (!key || key !== process.env.EXPORT_KEY) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase configuration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    res.status(500).json({ message: 'Server configuration error' });
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

  const { data, error } = await supabase
    .from('registrations')
    .select('id, created_at, ticket_id, full_name, email, organization, contact_number, qr_sent, checked_in, checked_in_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Database error during registrations export:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    res.status(500).json({ message: 'Database error' });
    return;
  }

  const columns = [
    'id',
    'created_at',
    'ticket_id',
    'full_name',
    'email',
    'organization',
    'contact_number',
    'qr_sent',
    'checked_in',
    'checked_in_at'
  ];

  // Helper to escape CSV fields (quote, double quotes, and formula injection)
  const escapeField = (value) => {
    const str = value !== null && value !== undefined ? String(value) : '';
    const escaped = str.replace(/"/g, '""'); // double quotes
    const needsQuote = /[",\n\r]/.test(escaped) || /^[=+\-@]/.test(escaped);
    return needsQuote ? `"${escaped.replace(/^([=+\-@])/, "'${'$1'}")}"` : escaped;
  };

  const rows = data.map(row => columns.map(col => escapeField(row[col])));

  // Build CSV string manually
  const csvLines = [];
  csvLines.push(columns.map(escapeField).join(','));
  rows.forEach(r => csvLines.push(r.join(',')));
  const csv = csvLines.join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.status(200).send(csv);
}
