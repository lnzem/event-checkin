# AGENTS.md

## Project
Event registration + QR ticketing + on-site check-in system.
Flow: Registration form -> Google Sheet -> unique QR generated -> confirmation email with QR -> scanner page marks "Checked In".

## Stack (do not change without asking)
- Frontend: plain HTML, CSS, vanilla JS (no frameworks, no build step)
- Backend: Google Apps Script (web app) bound to a Google Sheet
- Email: MailApp inside Apps Script
- QR generation: api.qrserver.com (fetch PNG blob, attach inline) 
- Scanner: html5-qrcode library via CDN, hosted on GitHub Pages
- Hosting: GitHub Pages for /web, Apps Script deployment for backend

## Structure
- /web/register   -> registration form
- /web/scanner    -> check-in scanner page
- /apps-script    -> Code.gs, appsscript.json (deployed via copy/paste or clasp)
- /design         -> Figma screenshots (UI reference)
- /docs           -> test logs, setup notes

## Data model (Sheet columns, in order)
Timestamp | Ticket ID | Full Name | Email | Organization | Contact Number | QR Sent | Checked In | Checked In At

## Rules
- Ticket ID = short unique string (e.g. EVT-XXXXXX), generated server-side, never client-side.
- Validate on BOTH client and server (required fields, email format, PH mobile number format).
- Prevent duplicate registrations by email.
- Check-in must be idempotent: scanning an already checked-in ticket shows "Already checked in at <time>", not an error.
- No secrets in the repo. Script IDs/URLs go in a config.js that is documented in README.
- Mobile-first; the scanner page will be used on phones.
- Match the visual style in /design (colors, type, spacing, component shapes). Extract tokens into CSS variables in one file.

## Workflow
- One feature per branch; small commits using conventional commits (feat:, fix:, chore:).
- After each task: summarize what changed, list files touched, and give me the exact manual test steps.
- Do not mark a task done until its verification step is described and I confirm it passed.
- Ask before adding any dependency.

## Definition of done per phase
1. Form: test entry lands in Sheet with all fields correct.
2. QR: test row produces a unique QR for that Ticket ID.
3. Email: test inbox receives email with QR visible inline.
4. Scanner: scanning test QR flips Checked In = TRUE with timestamp.