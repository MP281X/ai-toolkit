---
name: ui
description: Load when building or styling components — Tailwind, theme tokens, shadcn primitives, icons.
metadata:
  patterns: |
    cn(, className=, theme.css, components/ui,
    shadcn, @ai-toolkit/components, tailwind
---

## Source files

- `**/src/**/theme.css`
- `**/src/components/ui/**`
- `apps/*/components.json`

## Rules

- Reuse existing primitives before composing new ones
- USE `bunx --bun shadcn@latest add <name>` to add primitives
- USE `bunx --bun shadcn@latest docs <name>` to read docs
- USE `bunx --bun shadcn@latest view <name>` to inspect registry source
- USE `cn()` for conditional classes
- Prefer icons for repeated actions when clarity stays high

## Visual Principles

- Squared edges. Avoid rounded pills and soft cards.
- High contrast. Keep borders visible on containers.
- No effects. No gradients, glass, blur, or shadows.
- Minimal motion. Only functional animation.
- Monospace first.
- Dense layouts. Optimize for information density.

## Examples

```bash
# Bad
# copy-paste component source manually

# Good
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest docs button
bunx --bun shadcn@latest view button
```
