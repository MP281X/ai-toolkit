# UI Design

## System

Surfaces are dense, bordered, high-contrast, and scan-first.

Read the existing system before composing:

- primitives: `packages/components/src/components/ui/*.tsx`
- adapters: `packages/components/src/components/*.tsx`
- icons: `packages/components/src/components/icons.tsx`
- tokens: `packages/components/src/theme.css`

Use `@deslop/components` exports before custom UI. Discover and add missing primitives with:

```bash
vp run shadcn list @shadcn
vp run shadcn add <component>
```

Generated primitives under `packages/components/src/components/ui/*` change only through `vp run shadcn`.

## Composition

Compose primitives at the feature boundary. An adapter must own layout policy, domain behavior, local state, a repeated interaction, or cross-screen consistency. Keep its API narrow, slot-friendly, and explicit about overrides.

One action has one local, discoverable entrypoint. One visualization has one representation unless comparison is the task.

## Loading and mutation

Existing route boundaries own route loading. Local waiting state stays in the affected region and preserves layout.

- Skeleton: stable final shape.
- Spinner: local pending work.
- Repeated mutation: keyed pending state beside the affected row.
- Error toast: recovery is obvious.
- Inline error: input or recovery choice must change.
- Destructive flow: confirmation, pending, and failure stay in the launching control or dialog.

Unrelated controls remain active. Replacing an action icon with a same-size spinner preserves layout.

## Controls

Use icons for repeated, dense, constrained, or secondary actions. Use text for primary, rare, ambiguous, or destructive confirmation. High-risk actions use icon plus short text.

Icon buttons require `aria-label` or `title`; unfamiliar icons require a tooltip. Controls stay beside affected data, and repeated state indicators share a visual column.

## Styling

Theme tokens and primitive variants own color, spacing, borders, radius, hover, and focus. Local classes express layout, containment, truncation, overflow, and state.

Keep corners square unless the primitive owns radius. Gradients, shadows, blur, glass, marketing backgrounds, and nested cards are outside the product language.

Match surrounding size, icon scale, density, border, placement, pending state, and disabled behavior.

## Copy

Use the shortest clear label and complete user-facing language. Omit implementation, shortcut, and feature explanations. Copy must fit mobile and desktop; heading scale follows its container.
