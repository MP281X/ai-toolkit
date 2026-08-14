# UI design

## System

| Surface         | Construction                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Typography      | Monospace everywhere                                                                             |
| Density         | Compact; scan-first                                                                              |
| Mobile          | First-class behavior and hierarchy                                                               |
| Composition     | Flat; borders, dividers, and spacing group content                                               |
| Cards           | Default none; use only for an independently meaningful structural entity; never nest             |
| Actions         | One entrypoint per context; prefer icons over text                                               |
| Icon meaning    | Tooltip only when non-conventional                                                               |
| Decoration      | Solid theme tokens; square corners; no gradients, shadows, blur, glass, or background art        |
| Feedback        | Immediate, unmistakable state/action response through minimal non-distracting micro-interactions |
| Data            | Server-authoritative, real-time, stable during live updates                                      |
| Query or stream | Suspense/error boundary                                                                          |
| Mutation        | Pending and failure at launcher; concurrent work keyed by identity                               |

Use current `@deslop/components` primitives, adapters, icons, and theme tokens. Add a missing generated primitive only through:

```bash
vp run shadcn add <component>
```

Theme tokens and primitive variants own visual policy. Local classes own layout, containment, truncation, overflow, and state.

## Critique

| Lens                 | Complete questions                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Function             | Is the purpose immediate? Is each fact and action represented once? What can disappear?               |
| Hierarchy            | Does order, grouping, and density expose the primary state and action without nested containers?      |
| Interaction          | Is every affordance clear? Does each action have one path and immediate causal feedback?              |
| State · live updates | Are loading, empty, failure, optimistic, reconnecting, and authoritative updates coherent and stable? |
| Mobile               | Does every flow, action, hierarchy, and dense control work at narrow width?                           |
| Visual system        | Are typography, spacing, borders, colors, and icons consistent and information-bearing?               |
| Runtime performance  | Are input response, streaming updates, rendering, layout, console, and network behavior clean?        |

Final UI assurance inspects the actual app visually and behaviorally on desktop and mobile; source inspection is insufficient.

## Source

- `.agents/repos/base-ui/packages/react/src`
- `.agents/repos/react/packages/react-dom-bindings/src`
