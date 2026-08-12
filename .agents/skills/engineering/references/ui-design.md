# UI design

Dense scan-first layout · square corners · visible borders · accessible contrast.

Use current `@deslop/components` primitives, adapters, icons, and theme tokens. Add a missing generated primitive only through:

```bash
vp run shadcn add <component>
```

| Surface                         | Rule                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| Action                          | one entrypoint per interaction context                                    |
| Visualization                   | one representation unless comparison is the task                          |
| Composition                     | flat surfaces; borders and spacing carry hierarchy                        |
| Decoration                      | solid theme tokens; no gradients, shadows, blur, glass, or background art |
| Query or stream                 | loading and failure at nearest Suspense/error boundary                    |
| Mutation                        | pending and failure at launcher; concurrent work keyed by identity        |
| Destructive mutation            | confirmation plus mutation behavior                                       |
| Dense or secondary action       | icon with accessible name; tooltip when unfamiliar                        |
| Primary, rare, ambiguous action | shortest complete text label                                              |

Theme tokens and primitive variants own visual policy. Local classes own layout, containment, truncation, overflow, and state.

## Source

- `.agents/repos/base-ui/packages/react/src`
- `.agents/repos/react/packages/react-dom-bindings/src`
