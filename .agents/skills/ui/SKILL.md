---
name: ui
description: Use when changing component layout, visual styling, controls, icons, density, or interaction polish.
---

# UI

## Components

1. Use existing component package exports
2. Compose existing primitives with local layout
3. Add missing generated primitives with `vp run shadcn`
4. Write custom UI only when no existing primitive fits

## Style

- Dense, scan-first, repeated-action UI
- Controls adjacent to affected data
- Visible borders, high contrast
- Monospace for operational surfaces
- Square edges unless design system requires radius
- Avoid gradients, shadows, blur, glass, decorative backgrounds, and marketing composition
- Motion only for function
- No nested cards
- No prop-renaming wrappers

## Controls

- Clear repeated actions: icons
- Add tooltips for unfamiliar icon buttons
- Booleans: toggles/checkboxes
- Modes: segmented controls
- Option sets: menus
- Numbers: sliders/steppers/inputs
- One visible action path

## Text

- Short UI text
- No visible implementation/shortcut/feature explanations
- Text fits mobile and desktop
- Heading scale matches container
