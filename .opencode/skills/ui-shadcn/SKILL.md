---
name: ui-shadcn
description: UI components and styling
metadata:
  patterns: shadcn primitives, theme tokens, density, icons
---

## Source files

```
**/src/**/theme.css
**/src/components/ui/**
apps/*/components.json
```

## Purpose

- Preserve and reuse the existing shadcn components, tokens, and theme
- Prefer dense, information-rich layouts and avoid decorative filler
- Prefer icons for repeated actions when clarity is still preserved

## Where to look

- Existing primitives and local wrappers: `**/src/components/ui/**`
- Theme tokens and styling rules: `**/src/**/theme.css`

## Best practices

- Check existing primitives before building custom components
- Add missing primitives with the shadcn CLI instead of hand-copying component source
- Wrap existing primitives at screen level instead of forking them
- Keep styling aligned with the existing theme tokens and dense visual defaults
- Prefer icons for repeated actions when clarity is still preserved

- Squared, hard edges; avoid rounded pills and soft cards
- High contrast with visible borders on containers
- No gradients, glass effects, blur, or shadows
- Minimal functional motion only
- Monospace-first typography
- Dense first: optimize for information density

## Useful commands

Use the shadcn CLI instead of inventing install commands or copying component source manually.

```bash
# List available components
bunx --bun shadcn@latest list

# Add one component
bunx --bun shadcn@latest add button

# Add multiple components
bunx --bun shadcn@latest add dialog card input
```
