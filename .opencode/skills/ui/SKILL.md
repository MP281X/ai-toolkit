---
name: ui
description: Component styling with Tailwind, shadcn primitives, theme tokens, and icons.
---

## Rules

- Reuse existing primitives before composing new ones
- Use `bunx --bun shadcn@latest add <name>` to add primitives
- Use `bunx --bun shadcn@latest docs <name>` to read docs
- Use `bunx --bun shadcn@latest view <name>` to inspect registry source
- Use `cn()` for conditional classes
- Prefer icons for repeated actions when clarity stays high

## Visual style

- Squared edges — no rounded pills or soft cards
- High contrast — visible borders on containers
- No effects — no gradients, glass, blur, or shadows
- Minimal motion — only functional animation
- Monospace first
- Dense layouts — optimize for information density

## Examples

```bash
# Bad — copy-paste component source manually

# Good
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest docs button
bunx --bun shadcn@latest view button
```
