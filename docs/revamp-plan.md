# Event Check-In System Revamp Plan

## 1. Core Problems to Solve
1. **Missing Event Context:** The current `/register` page shows a bare form with no event title, date/time, venue, or summary.
2. **Code Edits Per Event:** Running a new event currently requires editing HTML/JS/config files and redeploying instead of managing events dynamically.
3. **Organizer Access & Tooling:** Organizers need a gated hub on the same domain for onboarding, launching the QR scanner, viewing registrations/check-ins, and exporting CSVs without exposing attendee PII publicly.

---

## 2. Target Architecture (Same Stack, Same Site)
- **Hosting & Backend:** Vercel static frontend (`/web`) + Vercel serverless functions (`/api`)
- **Database:** Supabase (PostgreSQL)
- **Email:** Resend (confirmation email with inline QR pass)
- **Design System:** Shared `web/shared/tokens.css` (`#0c0d10` background, `#1a1c22` surface, `#f8f8fa` text, `#c7f36b` lime accent, `Inter` font, mobile `390px`+ and desktop `max-width: 460px` / wider organizer container where tabular data requires it)

### Routes
| Route | Audience | Purpose |
|---|---|---|
| `/register` and `/e/<slug>` | Public Attendees | Displays event header (title, date/time, venue, description) + registration form + QR pass |
| `/scanner` | Organizers | QR camera scan (`html5-qrcode`) + manual Ticket ID fallback for check-in |
| `/organizer` | Organizers (Gated) | Passcode-protected hub with onboarding guide, event creator/switcher, live counts/attendee table, scanner shortcut, and CSV export |

---

## 3. Supabase Schema Changes

### New Table: `events`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | Default `gen_random_uuid()` |
| `slug` | `text` (UNIQUE) | URL-friendly identifier (e.g. `sia-seminar-2026`) |
| `title` | `text` | Event name shown on `/register` and in emails |
| `description` | `text` | Short event summary |
| `venue` | `text` | Location or online link |
| `event_date` | `timestamptz` | Event schedule |
| `is_active` | `boolean` | Marks the default event for `/register` |
| `created_at` | `timestamptz` | Default `now()` |

### Update Table: `registrations`
- Add `event_id` (`uuid`, FK -> `events.id`).
- Scope duplicate-email checks to `(event_id, email)` so the same attendee can register for different events without hitting a `409` conflict.
- Keep `ticket_id` (`SEM-XXXXXX`), `full_name`, `email`, `organization`, `contact_number`, `qr_sent`, `checked_in`, `checked_in_at`, and `created_at`.

---

## 4. API Endpoints to Add / Update

| Endpoint | Method | Access | Behavior |
|---|---|---|---|
| `/api/events` | `GET` | Public | Returns the active event (or specific event by `?slug=`) for `/register` |
| `/api/organizer/auth` | `POST` | Public -> Gated | Verifies `ORGANIZER_KEY` and sets an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie |
| `/api/organizer/events` | `GET`, `POST` | Organizer | Lists all events, creates a new event, or sets `is_active = true` on a selected event |
| `/api/organizer/registrations` | `GET` | Organizer | Returns summary counts (`registered`, `checked_in`, `remaining`) and attendee list filtered by `event_id` |
| `/api/register` | `POST` | Public | Accepts `event_id` (or falls back to active event), enforces per-event unique email, includes event title/date/venue in the Resend confirmation email |
| `/api/checkin` | `POST` | Organizer | Marks `checked_in = true` idempotently and returns event + attendee details |
| `/api/export` | `GET` | Organizer / Key | Downloads event-scoped `registrations.csv` via organizer cookie or `?key=EXPORT_KEY` |

---

## 5. Organizer Hub (`/web/organizer`) Features
1. **Passcode Gate:** Clean sign-in card matching `tokens.css` that unlocks the hub via `/api/organizer/auth`.
2. **Organizer Onboarding Checklist:** Built-in quick-start guide covering:
   - Creating/activating an event and copying its shareable `/e/<slug>` registration link.
   - Running a test registration and check-in before doors open.
   - Opening `/scanner` on mobile/PC gate devices.
   - Exporting final attendance CSV after the event.
3. **Event Manager:** Create a new event (title, slug, date/time, venue, description) or switch which event is currently active without touching code.
4. **Live Attendance & Database View:** Total registered vs. checked-in counters, searchable/filterable attendee list for the selected event, and 1-click CSV export.

---

## 6. Phased Rollout Plan
- **Phase 1 (Database & Events API):** Create `events` table, add `event_id` to `registrations`, build `/api/events`, and update `/api/register` to attach `event_id` and include event metadata in emails.
- **Phase 2 (Public Event Context on `/register`):** Fetch active/slug event details and render the event info header above the form.
- **Phase 3 (Organizer Auth & Hub `/organizer`):** Add `ORGANIZER_KEY` env var, `/api/organizer/*` routes, passcode gate, onboarding guide, event creator/switcher, attendee table, and CSV export button.
- **Phase 4 (Scanner Event Context):** Show the matched event title on `/scanner` check-in cards.
