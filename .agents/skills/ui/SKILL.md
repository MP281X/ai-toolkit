---
name: ui
description: Use when changing component layout, visual styling, controls, icons, density, or interaction polish.
---

# UI

## Components

- Use existing component package exports.
- Add missing generated primitive through root script.
- Write custom UI only when no existing primitive fits.

## Shadcn

- List available primitives first: `vp run shadcn -- list @shadcn`
- Add primitives: `vp run shadcn -- add <component> [<component> ...]`
- Manual edits to `packages/components/src/components/ui/*`: forbidden
- Generated UI changes only through `vp run shadcn`

## Style

- Dense, scan-first, repeated-action UI
- Controls adjacent to affected data
- Visible borders, high contrast
- Monospace for operational surfaces
- Square edges unless design system requires radius
- Avoid gradients, shadows, blur, glass, decorative backgrounds, and marketing composition
- No nested cards
- Adapter components must own layout, state, domain policy, or a repeated interaction contract.

## Controls

- Clear repeated actions: icons
- Add tooltips for unfamiliar icon buttons
- Booleans: toggles/checkboxes
- Modes: segmented controls
- Option sets: menus
- Numbers: sliders/steppers/inputs

## Text

- Short UI text
- No visible implementation/shortcut/feature explanations
- Text fits mobile and desktop
- Heading scale matches container
