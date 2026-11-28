# Design tokens

Source: supplied Figma mockups for the Live event discovery and registration experience. The implementation adapts those frames to the existing event registration and check-in features.

## Identity

- Brand: Live
- Style: clean, light, event-focused, responsive
- Type: Inter with system sans-serif fallbacks
- Accent: warm orange, used for primary actions and active navigation

## CSS variables

```css
:root {
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-subtle: #f3f4f5;
  --text: #0f1115;
  --text-muted: #5f6672;
  --border: #e3e5e9;
  --accent: #f26b21;
  --accent-hover: #d85618;
  --accent-soft: #fff0e9;
  --accent-contrast: #ffffff;
  --success: #21825b;
  --warning: #a55d10;
  --danger: #bd3b36;
}
```

## Layout and components

- Page background is white, with light gray form surfaces and subtle borders.
- Main content uses a centered 1120px container; the event, registration, and ticket views adapt to narrow screens.
- Header is a 68px white navigation bar on desktop and 60px on mobile. Mobile uses a simple fixed bottom navigation.
- Use Inter, with a 24px semibold brand, 15px navigation/body text, and 18px semibold section headings.
- Cards use 12px corners, light borders, and little to no shadow. Event cards stay flat and rely on spacing and image hierarchy.
- Primary actions use charcoal with white text and modest corners; orange marks the brand and active states. Secondary actions use white surfaces and gray borders.
- Form controls retain clear labels, visible focus rings, and responsive full-width layouts.
- Keep QR codes on a white background for reliable scanning.
