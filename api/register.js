import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

/** @type {import('@vercel/node').VercelRequestHandler} */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { full_name, email, organization, contact_number } = req.body ?? {};

  // Basic validation
  if (!full_name || !email || !organization || !contact_number) {
    res.status(400).json({ message: 'Missing required fields' });
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ message: 'Invalid email format' });
    return;
  }
  const phMobile = /^(?:09\d{9}|\+639\d{9})$/;
  if (!phMobile.test(contact_number)) {
    res.status(400).json({ message: 'Invalid PH mobile number' });
    return;
  }

  // Duplicate email check
  const { data: dup, error: dupErr } = await supabase
    .from('registrations')
    .select('id')
    .eq('email', email)
    .single();

  if (dupErr && dupErr.code !== 'PGRST116') {
    res.status(500).json({ message: 'Database error' });
    return;
  }
  if (dup) {
    res
      .status(409)
      .json({ message: 'A registration with that email already exists' });
    return;
  }

  // Generate ticket ID
  const ticket_id = `SEM-${Math.floor(100000 + Math.random() * 900000)}`;

  // Insert registration
  const { data: row, error: insertErr } = await supabase
    .from('registrations')
    .insert({
      full_name,
      email,
      organization,
      contact_number,
      ticket_id,
      qr_sent: false,
      checked_in: false
    })
    .single();

  if (insertErr) {
    res.status(500).json({ message: 'Failed to create registration' });
    return;
  }

  // QR code (encode only ticket_id)
  const qrDataUrl = await QRCode.toDataURL(ticket_id, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' }
  });

  // Send confirmation email via Resend
  const html = `
    <html>
      <body style="font-family:${"Inter"},sans-serif;background:#0c0d10;color:#f8f8fa;padding:24px;">
        <h1 style="font-size:27px;font-weight:700;margin:0;">Your registration is confirmed</h1>
        <p style="font-size:13px;color:#a5a7b2;">Ticket ID: <strong>${ticket_id}</strong></p>
        <img src="cid:qrcode" alt="QR code" style="display:block;margin:20px 0;width:244px;height:244px;border-radius:12px;background:#fff;">
      </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Seminar Registration Confirmation',
      html,
      attachments: [
        {
          filename: 'qrcode.png',
          content: qrDataUrl.split(',')[1],
          disposition: 'inline',
          contentId: 'qrcode'
        }
      ]
    });
    // Mark QR as sent
    await supabase.from('registrations').update({ qr_sent: true }).eq('id', row.id);
  } catch (_) {
    // Email failures are non‑fatal for the API response
  }

  res.status(200).json({ ticket_id, full_name, qr_data_url: qrDataUrl });
}
