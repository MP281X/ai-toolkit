---
name: ui
description: Component styling with Tailwind, shadcn primitives, theme tokens, and icons.
---

## Rules

- Use `@ai-toolkit/components` components directly before writing custom UI
- Compose available components instead of wrapping them or creating app-specific abstractions
- Reduce custom code to the smallest glue needed for layout, state, and data
- Install useful missing shadcn components instead of creating custom components
- Use `bunx --bun shadcn@latest add <name>` to add primitives
- Use `bunx --bun shadcn@latest docs <name>` to read docs
- Use `bunx --bun shadcn@latest view <name>` to inspect registry source
- Use the `@svgl` registry for logos when available
- Use `bunx --bun shadcn@latest add @svgl/<name>` for logo components when needed
- Use `cn()` for conditional classes
- Prefer icons for repeated actions when clarity stays high

## Component priority

1. Use existing `@ai-toolkit/components` components directly
2. Compose available components with minimal glue code
3. Install missing shadcn components with `bunx --bun shadcn@latest add <name>`
4. Install logos from `@svgl` when needed
5. Write custom UI only when no available or registry component fits

## Available components

Import from `@ai-toolkit/components/<name>`.

<available_components>
!`rg --files packages/components/src/components | sort | while read -r path; do component="${path#packages/components/src/components/}"; printf '%s\n' "${component%.tsx}"; done`
</available_components>

## Registries

- `packages/components/components.json` configures `@svgl`: `https://svgl.app/r/{name}.json`

## Design

- Only add elements that serve a clear purpose
- No unnecessary grouping — sections, cards, panels, or fieldsets need a UX reason
- One way to do each action — never duplicate controls
- Fewer borders, layers, and containers

## DevTools

Import: `import {DevTools} from '@ai-toolkit/components/dev-tools'`

DevTools components explore possibilities — not production code. Design rules apply loosely. Be creative, try different directions.

**`DevTools.Variants`** — explore variations of a single component. Range from minor style tweaks to bold creative approaches. User picks best aspects → combine into final version.

```tsx
<DevTools.Variants>
	<Card variant="compact" />
	<Card variant="dense" />
</DevTools.Variants>
```

**`DevTools.Navigation`** — switch between different pages or layouts. Used with TanStack Router, typically in `__root.tsx`.

```tsx
<DevTools.Navigation routes={['list', 'grid', 'board'] as const} onChange={view => navigate({search: {view}})} />
```

## Visual style

- Squared edges — no rounded corners
- High contrast — visible borders
- No effects — no gradients, glass, blur, shadows
- Minimal motion — functional animation only
- Monospace first
- Dense layouts — optimize for information density
