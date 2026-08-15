# Static enforcement

## Own

| Tool                          | Active owner                              | Available rules or source                            |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| TypeScript                    | `tsconfig.json`                           | `.agents/repos/typescript`                           |
| Oxlint · Oxfmt                | `vite.config.ts`                          | `.agents/repos/oxc` · `.agents/repos/vite-plus`      |
| Effect diagnostics            | `vite.config.ts`                          | `.agents/repos/effect-tsgo`                          |
| React Compiler · React Doctor | `vite.config.ts`                          | `.agents/repos/react` · `.agents/repos/react-doctor` |
| Fallow                        | `.fallowrc.json` · root `check` script    | `.agents/repos/fallow`                               |
| Custom Oxlint                 | `tools/oxlint-rules/src/oxlint-plugin.ts` | colocated tests                                      |

## Choose

1. Configured maintained rule.
2. Compatible maintained rule or option.
3. Custom Oxlint.
4. Domain skill.

## Custom Oxlint

| Gate       | Requirement                   |
| ---------- | ----------------------------- |
| Frequency  | Frequent                      |
| Detection  | Precise and static            |
| Ownership  | No maintained equivalent      |
| Correction | Stable canonical construction |

| Phase   | Required artifact                                     |
| ------- | ----------------------------------------------------- |
| Specify | Exact invalid form · architectural reason             |
| Prove   | BAD cases · valid counterexamples · unsupported cases |
| Detect  | Narrowest syntax · scope · path                       |
| Report  | Root cause · canonical correction                     |

Suppress only an irreducible boundary: narrow, inline, reasoned.
