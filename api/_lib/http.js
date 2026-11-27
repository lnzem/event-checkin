export function sendError(res, status, code, message, fields) {
  const payload = { code, message };
  if (fields && Object.keys(fields).length > 0) {
    payload.fields = fields;
  }
  return res.status(status).json(payload);
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return sendError(res, 405, 'method_not_allowed', 'Method Not Allowed');
}
