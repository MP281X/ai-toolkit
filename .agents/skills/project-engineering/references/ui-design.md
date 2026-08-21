# UI design

Apply this repository's visual system to functional application UI. The portfolio is exempt: preserve or deliberately evolve its own visual direction instead of imposing functional-app constraints.

## Visual System

| Surface      | Implementation                                                                            |
| ------------ | ----------------------------------------------------------------------------------------- |
| Typography   | Monospace everywhere                                                                      |
| Density      | Compact and scan-first                                                                    |
| Composition  | Flat. Borders, dividers, and spacing group content                                        |
| Cards        | Default none. Use only for an independently meaningful structural entity. Never nest      |
| Actions      | One entrypoint per context. Prefer icons over text                                        |
| Icon meaning | Tooltip only when non-conventional                                                        |
| Decoration   | Solid theme tokens. Square corners. No gradients, shadows, blur, glass, or background art |
| Feedback     | Minimal, immediate, unmistakable state and action response                                |

Use current `@deslop/components` primitives, adapters, and icons. Functional UI colors must use the shadcn semantic theme tokens exposed by `@deslop/components`. Do not hard-code palette values in features.

```bash
vp run shadcn add <component>
```

| Owner                               | Responsibility                                       |
| ----------------------------------- | ---------------------------------------------------- |
| Theme tokens and primitive variants | Visual policy                                        |
| Local classes                       | Layout, containment, truncation, overflow, and state |

## Source

Resolve configured references, then inspect `base-ui:packages/react/src` and `react:packages/react-dom-bindings/src`.
