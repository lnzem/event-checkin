import crypto from 'node:crypto';
import QRCode from 'qrcode';

export function generateTicketId() {
  return `SEM-${crypto.randomInt(100000, 1000000)}`;
}

export async function generateQrAssets(ticketId) {
  const options = {
    errorCorrectionLevel: 'M',
    width: 600,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  };

  const [qrDataUrl, qrBuffer] = await Promise.all([
    QRCode.toDataURL(ticketId, options),
    QRCode.toBuffer(ticketId, options),
  ]);

  return { qrDataUrl, qrBuffer };
}
