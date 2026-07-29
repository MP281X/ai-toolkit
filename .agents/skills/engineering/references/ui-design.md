# UI design

## Intent

Keep product surfaces dense, bordered, high-contrast, scan-first, and consistent with their surrounding interaction.

Read existing primitives, adapters, icons, and theme tokens before composing. Use `@deslop/components` exports first. Add missing generated primitives only with:

```bash
vp run shadcn list @shadcn
vp run shadcn add <component>
```

- Compose primitives at the feature boundary. An adapter owns layout policy, domain behavior, local state, repeated interaction, or cross-screen consistency.
- One action has one discoverable entrypoint; one visualization has one representation unless comparison is the task.
- Preserve layout while loading: stable-shape skeletons for content, local spinners for pending work, keyed pending state for repeated mutations.
- Keep destructive confirmation, pending, and failure in the launching control or dialog. Unrelated controls remain active.
- Use icons for repeated, dense, constrained, or secondary actions; text for primary, rare, ambiguous, or destructive confirmation.
- Icon buttons require accessible names; unfamiliar icons require a tooltip.
- Theme tokens and primitive variants own color, spacing, borders, radius, hover, and focus. Local classes own layout, containment, truncation, overflow, and state.
- Keep corners square unless the primitive owns radius. Match surrounding size, density, border, placement, pending, and disabled behavior.
- Use the shortest complete label.

**Reject:** gradients, shadows, blur, glass, marketing backgrounds, nested cards, decorative variants, implementation copy, and duplicated representations.
