# UI design

## Intent

Keep product surfaces dense, bordered, high-contrast, square, and scan-first.

Use current `@deslop/components` primitives, adapters, icons, and theme tokens before composing. Add a missing generated primitive only through:

```bash
vp run shadcn add <component>
```

| Surface                       | Rule                                                     |
| ----------------------------- | -------------------------------------------------------- |
| Action                        | one discoverable entrypoint                              |
| Visualization                 | one representation unless comparison is the task         |
| Content loading               | stable-shape skeleton                                    |
| Local pending work            | spinner in the launching control                         |
| Repeated mutation             | pending state keyed by identity                          |
| Destructive action            | confirmation and failure at the launching control/dialog |
| Dense/secondary action        | icon with accessible name; tooltip when unfamiliar       |
| Primary/rare/ambiguous action | shortest complete text label                             |

Theme tokens and primitive variants own visual policy. Local classes own layout, containment, truncation, overflow, and state.

Reject gradients, shadows, blur, glass, marketing backgrounds, nested cards, decorative variants, implementation copy, duplicated representations, and local style systems.
