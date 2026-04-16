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

## Design

- Only add elements that serve a clear purpose
- No unnecessary grouping — sections, cards, panels, or fieldsets need a UX reason
- One way to do each action — never duplicate controls
- Fewer borders, layers, and containers

## DevTools

Import: `import {DevTools} from '@ai-toolkit/components/dev-tools'`

DevTools components are for **exploring possibilities** — not production code. Be creative, try different directions so the user can discover what they like and don't like. Design rules apply loosely as best-practices, not strict constraints.

**`DevTools.Variants`** — explore variations of a single component. Can range from minor style tweaks to bold creative approaches. User picks the best aspects from each variant, then you combine them into a final version.

```tsx
<DevTools.Variants>
	<Card variant="compact" />
	<Card variant="dense" />
</DevTools.Variants>
```

**`DevTools.Navigation`** — switch between completely different pages or layouts. Used with TanStack Router, typically in `__root.tsx`. Each route is a distinct page structure.

```tsx
<DevTools.Navigation
	routes={['list', 'grid', 'board'] as const}
	onChange={view => navigate({search: {view}})}
/>
```

## Visual style

- Squared edges — no rounded pills or soft cards
- High contrast — visible borders on containers
- No effects — no gradients, glass, blur, or shadows
- Minimal motion — only functional animation
- Monospace first
- Dense layouts — optimize for information density
