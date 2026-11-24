# AGENTS.md

## Project
Event registration + QR ticketing + on-site check-in system.
Flow: Registration form -> Vercel API -> Supabase -> unique QR generated -> Resend confirmation email -> scanner page marks "Checked In".

## Stack (do not change without asking)
- Frontend: plain HTML, CSS, vanilla JS in /web (no frontend frameworks, no build step)
- Backend: Vercel Serverless Functions in /api (Node.js)
- Database: Supabase (@supabase/supabase-js)
- Email: Resend SDK (attach QR PNG inline via cid)
- QR generation: qrcode npm package (generate PNG buffer server-side)
- Scanner: html5-qrcode library via CDN
- Hosting: Vercel (static /web + /api functions)

## Structure
- /web/register   -> registration form
- /web/scanner    -> check-in scanner page
- /web/shared     -> tokens.css and shared utilities
- /api            -> Vercel serverless endpoints (register.js, checkin.js, export.js)
- /design         -> Figma reference
- /docs           -> design-tokens.md, setup notes

## Data model (Supabase table: registrations)
id (uuid, pk) | created_at (timestamptz) | ticket_id (text, unique) | full_name (text) | email (text, unique) | organization (text) | contact_number (text) | qr_sent (boolean) | checked_in (boolean) | checked_in_at (timestamptz)

## Rules
- Ticket ID = short unique string (e.g. SEM-XXXXXX), generated server-side, never client-side.
- Validate on BOTH client and server (required fields, email format, PH mobile number format).
- Prevent duplicate registrations by email (return 409 Conflict with a clear message).
- Check-in must be idempotent: scanning an already checked-in ticket returns 200 with status "already_checked_in" and original timestamp.
- Never commit secrets. Read SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and EXPORT_KEY from process.env.
- Mobile-first (390px target); match /docs/design-tokens.md.

## Workflow
- One feature per branch; small commits using conventional commits (feat:, fix:, chore:).
- After each task: summarize what changed, list files touched, and give exact manual test steps.
- Ask before adding any new dependency.
