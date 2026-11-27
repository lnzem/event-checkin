import { Resend } from 'resend';

const TIMEZONE = 'Asia/Manila';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatManilaDateRange(startsAt, endsAt) {
  if (!startsAt) return 'TBA';
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const startDate = dateFmt.format(start);
  const startTime = timeFmt.format(start);

  if (!end || Number.isNaN(end.getTime())) {
    return `${startDate} · ${startTime}`;
  }

  const endDate = dateFmt.format(end);
  const endTime = timeFmt.format(end);

  if (startDate === endDate) {
    return `${startDate} · ${startTime} – ${endTime}`;
  }
  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

export async function sendTicketsEmail({ to, attendeeName, tickets }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  const from = process.env.MAIL_FROM?.trim() || 'onboarding@resend.dev';
  const siteUrl = (process.env.SITE_URL?.trim() || '').replace(/\/$/, '');
  const loginUrl = siteUrl ? `${siteUrl}/login` : '/login';

  const subject =
    tickets.length === 1
      ? `Your ticket for ${tickets[0].event.title}`
      : `Your tickets for ${tickets.length} upcoming events`;

  const attachments = tickets.map((t, idx) => ({
    filename: `ticket-${t.ticket_id}.png`,
    content: t.qrBuffer.toString('base64'),
    disposition: 'inline',
    contentId: `qrcode-${idx}`,
  }));

  const ticketBlocksHtml = tickets
    .map((t, idx) => {
      const dateLine = formatManilaDateRange(t.event.starts_at, t.event.ends_at);
      return `
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;">
          <h2 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(t.event.title)}</h2>
          <p style="margin:0 0 4px 0;font-size:14px;color:#4b5563;">${escapeHtml(dateLine)} (Asia/Manila)</p>
          <p style="margin:0 0 20px 0;font-size:14px;color:#4b5563;">${escapeHtml(t.event.venue || 'TBA')}</p>
          <div style="text-align:center;background:#ffffff;padding:16px;border:1px solid #f3f4f6;border-radius:8px;margin-bottom:16px;">
            <img src="cid:qrcode-${idx}" alt="QR code for ${escapeHtml(t.ticket_id)}" width="220" height="220" style="display:block;margin:0 auto;width:220px;height:220px;" />
          </div>
          <p style="margin:0 0 8px 0;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:0.08em;color:#111827;">${escapeHtml(t.ticket_id)}</p>
          <p style="margin:0;text-align:center;font-size:13px;color:#6b7280;">Show this QR at the entrance.</p>
        </div>
      `;
    })
    .join('');

  const greetingName = attendeeName || tickets[0]?.full_name || 'there';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;">Hi ${escapeHtml(greetingName)},</p>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#374151;">Here ${tickets.length === 1 ? 'is your event ticket' : 'are your event tickets'}:</p>
    ${ticketBlocksHtml}
    <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;text-align:center;">
      <a href="${escapeHtml(loginUrl)}" style="color:#4f46e5;text-decoration:underline;">Log in to see all your tickets</a>
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Hi ${greetingName},`,
    '',
    ...tickets.flatMap((t) => [
      `${t.event.title}`,
      `When: ${formatManilaDateRange(t.event.starts_at, t.event.ends_at)} (Asia/Manila)`,
      `Where: ${t.event.venue || 'TBA'}`,
      `Ticket ID: ${t.ticket_id}`,
      'Show this QR at the entrance.',
      '',
    ]),
    `Log in to see all your tickets: ${loginUrl}`,
  ].join('\n');

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
    attachments,
  });

  // Resend reports API rejections in `error` instead of throwing. Treat those
  // as failures so callers never mark a rejected message as delivered.
  if (error || !data?.id) {
    console.error('Resend rejected ticket email:', error?.name, error?.statusCode, error?.message);
    return { sent: false, reason: error?.message || 'Resend returned no email ID' };
  }

  return { sent: true };
}
