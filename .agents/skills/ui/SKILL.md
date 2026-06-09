---
name: ui
description: Use when changing component layout, visual styling, controls, icons, density, or interaction polish.
---

# UI

Build dense, direct, work-focused interfaces.

## Component Priority

1. Use existing component package exports
2. Compose existing primitives with local layout
3. Add missing shadcn primitives through the repo script when needed
4. Write custom UI only when no existing primitive fits

## Style

- Prefer dense layouts optimized for scanning and repeated action
- Keep controls close to the data they affect
- Use visible borders and high contrast
- Prefer monospace for operational surfaces
- Keep edges square unless the local design system requires radius
- Avoid gradients, shadows, blur, glass, decorative backgrounds, and marketing composition
- Use functional motion only
- Do not put cards inside cards
- Do not create wrappers that only rename component props

## Controls

- Use icons for repeated actions when the icon is clear
- Add tooltips for unfamiliar icon-only controls
- Use toggles or checkboxes for booleans
- Use segmented controls for modes
- Use menus for option sets
- Use sliders, steppers, or inputs for numeric values
- Keep one visible way to perform each action

## Text

- Keep interface text short
- Do not explain implementation, shortcuts, or feature behavior in visible app text
- Ensure text fits at mobile and desktop sizes
- Use heading scale that matches the container size
