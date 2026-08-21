# UI design

## Visual System

| Surface      | Construction                                                                              |
| ------------ | ----------------------------------------------------------------------------------------- |
| Typography   | Monospace everywhere                                                                      |
| Density      | Compact; scan-first                                                                       |
| Composition  | Flat; borders, dividers, and spacing group content                                        |
| Cards        | Default none; use only for an independently meaningful structural entity; never nest      |
| Actions      | One entrypoint per context; prefer icons over text                                        |
| Icon meaning | Tooltip only when non-conventional                                                        |
| Decoration   | Solid theme tokens; square corners; no gradients, shadows, blur, glass, or background art |
| Feedback     | Minimal, immediate, unmistakable state and action response                                |

Use current `@deslop/components` primitives, adapters, icons, and theme tokens.

```bash
vp run shadcn add <component>
```

| Owner                               | Responsibility                                       |
| ----------------------------------- | ---------------------------------------------------- |
| Theme tokens and primitive variants | Visual policy                                        |
| Local classes                       | Layout, containment, truncation, overflow, and state |

## Source

Resolve configured references, then inspect `base-ui:packages/react/src` and `react:packages/react-dom-bindings/src`.
