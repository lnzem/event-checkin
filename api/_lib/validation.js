const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_RE = /^(09\d{9}|\+639\d{9})$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizePhone(value) {
  return typeof value === 'string' ? value.replace(/[\s-]+/g, '').trim() : '';
}

export function normalizeTicketId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function validateRegistrationInput(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const fields = {};

  const event_id = typeof raw.event_id === 'string' ? raw.event_id.trim() : '';
  if (!isValidUuid(event_id)) {
    fields.event_id = 'A valid event is required.';
  }

  const full_name = typeof raw.full_name === 'string' ? raw.full_name.trim() : '';
  if (full_name.length < 2 || full_name.length > 100) {
    fields.full_name = 'Full name must be between 2 and 100 characters.';
  }

  const email = normalizeEmail(raw.email);
  if (!isValidEmail(email)) {
    fields.email = 'Enter a valid email address.';
  }

  const organization = typeof raw.organization === 'string' ? raw.organization.trim() : '';
  if (organization.length < 2 || organization.length > 100) {
    fields.organization = 'Organization must be between 2 and 100 characters.';
  }

  const contact_number = normalizePhone(raw.contact_number);
  if (!PH_MOBILE_RE.test(contact_number)) {
    fields.contact_number = 'Enter a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX).';
  }

  return {
    valid: Object.keys(fields).length === 0,
    fields,
    data: {
      event_id,
      full_name,
      email,
      organization,
      contact_number,
    },
  };
}
