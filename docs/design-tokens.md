# Design tokens

Source: Figma "SIA - Seminar Regis System (Copy)", page "Sample", frames 03 Registration (37:54) and 04 QR pass (37:77).
Style: dark, mobile-first (designed at 390px wide), lime accent, Inter font.

## CSS variables

:root {
  /* Color */
  --color-bg: #0c0d10;
  --color-surface: #1a1c22;
  --color-text: #f8f8fa;
  --color-text-muted: #a5a7b2;
  --color-accent: #c7f36b;
  --color-accent-ink: #10140b;   /* text on accent buttons */
  --color-qr-bg: #ffffff;
  --color-qr-ink: #24262b;
  --color-qr-muted: #666b70;

  /* Type: Inter */
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --fs-h1: 27px;        /* 700 */
  --fs-header: 17px;    /* 600 */
  --fs-back: 25px;      /* 400 */
  --fs-card-title: 18px;/* 600 */
  --fs-input: 15px;     /* 400 */
  --fs-button: 15px;    /* 600 */
  --fs-body: 13px;      /* 400, muted */
  --fs-label: 12px;     /* 400, muted */
  --fs-eyebrow: 11px;   /* 600, UPPERCASE */

  /* Radius */
  --radius-card: 16px;
  --radius-pass: 18px;
  --radius-field: 12px;
  --radius-button: 14px;
  --radius-qr: 12px;

  /* Spacing */
  --space-page-x: 24px;
  --space-page-top: 26px;
  --space-page-bottom: 24px;
  --space-stack: 20px;        /* gap between sections */
  --space-card: 18px;         /* card padding */
  --space-card-gap: 12px;     /* gap inside cards */
  --space-field-x: 16px;
  --space-field-y: 13px;
  --space-field-gap: 6px;     /* label to value */
  --space-button-y: 15px;
  --content-max-width: 342px; /* 390 - 2*24 */
}

## Component notes

- Page: bg var(--color-bg), padding 26px 24px 24px, sections stacked with 20px gap.
- Header: back chevron ‹ (25px) + title (17px/600), 18px gap.
- Heading: 27px bold. Subtext: 13px muted.
- Seminar card: surface bg, 16px radius, 18px padding. Eyebrow in accent (11px/600) + "- FREE" in muted. Title 18px/600. Date and venue 13px muted.
- Section label ("YOUR DETAILS"): 11px/600 uppercase, muted.
- Field: surface bg, 12px radius, no visible border. Label INSIDE the field above the value: label 12px muted, value 15px text color. Padding 13px 16px, 6px gap.
- Primary button: accent bg, accent-ink text 15px/600, 14px radius, 15px vertical padding, full width.
- Pass card: surface bg, 18px radius, 22px 20px padding, 16px gap, centered. QR box 244x244, white bg, 12px radius.
- Pass footer: attendee name 13px/600 uppercase, then "Registration ID - SEM-2026-001" 12px muted.

## Not in the Figma (must be designed by the agent, flagged for review)

- Fields Organization and Contact Number: reuse the exact Full name / Email field style.
- Focus state: suggest 1.5px accent outline.
- Error state: suggest a red text/outline color plus a short message below the field.
- Loading state: button disabled with spinner and "Registering...".
