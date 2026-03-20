---
name: ui
description: Load when building or styling components — Tailwind, theme tokens, shadcn primitives, icons.
metadata:
  patterns: |
    cn(, className=, theme.css, components/ui,
    shadcn, @ai-toolkit/components, tailwind
---

## Source files

```
**/src/**/theme.css
**/src/components/ui/**
apps/*/components.json
```

## Key patterns

- Reuse existing primitives before composing new ones
- Add primitives with `bunx --bun shadcn@latest add <name>`
- Read docs with `bunx --bun shadcn@latest docs <name>`
- Inspect registry source with `bunx --bun shadcn@latest view <name>`
- Use `cn()` for conditional classes. `cn-classname` enforces the exact shape.
- Prefer icons for repeated actions when clarity stays high

## Visual principles

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
