# Design tokens

Source: Figma "SIA - Seminar Regis System (Copy)", page "Sample", frames 03 Registration (37:54) and 04 QR pass (37:77).
Style: dark, responsive (mobile-first at 390px, centered cleanly on desktop >= 768px), lime accent, Inter font.

## CSS variables

:root {
  /* Color */
  --color-bg: #0c0d10;
  --color-surface: #1a1c22;
  --color-text: #f8f8fa;
  --color-text-muted: #a5a7b2;
  --color-accent: #c7f36b;
  --color-accent-ink: #10140b;
  --color-qr-bg: #ffffff;
  --color-qr-ink: #24262b;
  --color-qr-muted: #666b70;
  --color-error: #ff6b6b;

  /* Type: Inter */
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --fs-h1: 27px;
  --fs-header: 17px;
  --fs-back: 25px;
  --fs-card-title: 18px;
  --fs-input: 15px;
  --fs-button: 15px;
  --fs-body: 13px;
  --fs-label: 12px;
  --fs-eyebrow: 11px;

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
  --space-stack: 20px;
  --space-card: 18px;
  --space-card-gap: 12px;
  --space-field-x: 16px;
  --space-field-y: 13px;
  --space-field-gap: 6px;
  --space-button-y: 15px;
  --content-max-width: 342px;
  --desktop-max-width: 460px;
}

## Component notes

- Page: bg var(--color-bg), padding 26px 24px 24px, sections stacked with 20px gap. On desktop (>= 768px), center main container up to 460px max-width with generous top/bottom padding.
- Header: back chevron ‹ (25px) + title (17px/600), 18px gap.
- Heading: 27px bold. Subtext: 13px muted.
- Field: surface bg, 12px radius, label inside above value (12px muted label, 15px text value), padding 13px 16px, 6px gap. Focus ring: 1.5px solid var(--color-accent).
- Primary button: var(--color-accent) bg, var(--color-accent-ink) text 15px/600, 14px radius, 15px vertical padding, full width.
- Pass card: var(--color-surface) bg, 18px radius, 22px 20px padding, 16px gap, centered. QR box 244x244, white bg, 12px radius.
