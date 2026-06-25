---
name: ui
description: Use when changing component layout, visual styling, controls, icons, density, interaction polish, mutation UX, loading UX, or design-system composition.
---

# UI

## Defaults

- Match nearby Deslop UI before inventing a pattern.
- Dense, bordered, high-contrast, scan-first surfaces.
- Add headers, cards, descriptions, empty states, or helper text only when they change the workflow.

## Primitives

- Before designing UI, read what exists; do not guess component names or props.
  - Primitives: `packages/components/src/components/ui/*.tsx`.
  - Adapters: `packages/components/src/components/*.tsx`.
  - Icons: `packages/components/src/components/icons.tsx`.
- Build from these `@deslop/components` exports; custom UI is the fallback.
- Missing primitive: list with `vp run shadcn list @shadcn`, then add with `vp run shadcn add <component> [<component> ...]`.
- Generated UI changes only through `vp run shadcn`; manual edits to `packages/components/src/components/ui/*` are forbidden.

## Composition

- Compose primitives at the feature boundary.
- Add adapters only when they own layout policy, domain behavior, local state, a repeated interaction contract, or cross-screen consistency.
- Keep adapter APIs narrow, slot-friendly, override-friendly.
- Keep children composable; no hidden side effects in presentational components.

## Single Flow

- One action, one primary flow.
- One representation per visualization unless comparison is the goal.
- No duplicate toolbar, context-menu, command-palette, inline, or empty-state action for the same operation.
- Consolidate existing entrypoints toward the most local and discoverable one.

## Loading UX

- Route/layout loading is owned by existing boundaries; do not duplicate it in the route body.
- Show loading state in the specific region that is waiting, not over the whole screen.
- Preserve layout during loading.
- Skeletons only when final shape is stable; small inline spinners for local pending.
- Full-panel loading only when the whole panel is unusable.
- No loading copy when shape or spinner suffices.

## Mutation UX

- Every trigger shows pending state, adjacent to the affected control or row.
- Disable only the affected control or scope; never block unrelated UI.
- Keyed pending state for list rows and repeated actions.
- Replace the action icon with a same-size spinner when pending; preserve layout.
- Errors via toast when recovery is obvious; inline only when the user must edit input or choose recovery.
- Destructive mutations keep confirmation, pending, and error inside the launching dialog/control.
- No global loaders, suspense, or error boundaries for local mutation state.

## Icons

- Icons for repeated, dense, constrained, or secondary controls.
- Text for primary, rare, destructive-confirmation, or ambiguous actions.
- Icon + short text for irreversible or high-risk actions.
- Icon buttons require `aria-label` or `title`; unfamiliar icons require a tooltip.
- Semantic icons from `@deslop/components/icons`.
- No explanatory text beside self-evident controls.

## Styling

- Read `packages/components/src/theme.css` and follow its tokens; do not hardcode values it already defines.
- Rely on primitive variants, sizes, slots, defaults.
- Classes express layout, containment, truncation, overflow, local state.
- No classes that restate primitive defaults.
- Local color, spacing, border, hover, focus, radius classes only when they encode local structure or state.
- Keep corners square unless the primitive is already rounded.
- No gradients, shadows, blur, glass, marketing backgrounds, or nested cards.

## Consistency

- Keep sizes, icon dimensions, density, borders, and control placement consistent with surrounding UI.
- Controls stay adjacent to affected data; state indicators stay in the same visual column across rows.
- Repeated actions share icon, title, disabled behavior, and pending behavior everywhere.

## Experimentation

- Use devtools for nontrivial UI.
- `DevTools.Variants`: 2-3 viable variants before finalizing.
- `DevTools.Navigation`: route-level or screen-level alternatives.
- Variants differ by interaction model or layout, not decorative styling.
- Compare by density, scan speed, state clarity, control adjacency, consistency, class count, primitive reuse, single flow.
- User chooses before finalizing.
- Keep the simplest variant that preserves the workflow; remove scaffolding after acceptance.

## Text

- Short labels; icon/title/tooltip over inline prose.
- No visible implementation, shortcut, or feature explanations.
- Text fits mobile and desktop; heading scale matches container scale.
- Delete copy that does not change behavior.
