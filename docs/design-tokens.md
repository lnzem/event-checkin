# Design tokens

Source: supplied Figma mockups for the Live event discovery and registration experience. The implementation adapts those frames to the existing event registration and check-in features.

## Identity

- Brand: Live
- Style: light, warm, event-focused, responsive
- Type: Inter with system sans-serif fallbacks
- Accent: warm orange, used for primary actions and active navigation

## CSS variables

```css
:root {
  --bg: #fbfaf8;
  --surface: #ffffff;
  --surface-subtle: #f6f4f1;
  --text: #202124;
  --text-muted: #626873;
  --border: #e7e8ec;
  --accent: #f26b21;
  --accent-hover: #da5713;
  --accent-soft: #fff0e6;
  --accent-contrast: #ffffff;
  --success: #21825b;
  --warning: #a55d10;
  --danger: #bd3b36;
}
```

## Layout and components

- Page background is warm off-white, with white content surfaces and subtle gray borders.
- Main content uses a centered 1120px container; the event, registration, and ticket views adapt to narrow screens.
- Header is a 76px white navigation bar on desktop and 68px on mobile.
- Use Inter, with a 24px semibold brand, 15px navigation/body text, and 18px semibold section headings.
- Cards use 14–16px corners, a light border, and a restrained shadow. Hoverable event cards lift slightly.
- Primary actions use charcoal with white text and pill-shaped corners; orange marks the brand and active states. Secondary actions use white surfaces and gray borders.
- Form controls retain clear labels, visible focus rings, and responsive full-width layouts.
- Keep QR codes on a white background for reliable scanning.
