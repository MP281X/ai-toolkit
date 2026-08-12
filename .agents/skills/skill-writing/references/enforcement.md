# Static enforcement

## Own

| Tool                          | Active owner                                 | Available rules or source                            |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| TypeScript                    | `tsconfig.json`                              | `.agents/repos/typescript`                           |
| Oxlint · Oxfmt                | `vite.config.ts`                             | `.agents/repos/oxc` · `.agents/repos/vite-plus`      |
| Effect diagnostics            | `vite.config.ts`                             | `.agents/repos/effect-tsgo`                          |
| React Compiler · React Doctor | `vite.config.ts`                             | `.agents/repos/react` · `.agents/repos/react-doctor` |
| Fallow                        | `.fallowrc.json` · root `check` script       | `.agents/repos/fallow`                               |
| Custom Oxlint                 | `packages/oxlint-rules/src/oxlint-plugin.ts` | colocated tests                                      |

## Choose

```text
configured maintained rule
→ available maintained rule
→ stricter maintained option
→ compatible maintained rule group
→ maintained generic restriction
→ custom Oxlint
→ skill-only semantic guidance
```

## Custom Oxlint

```text
Required:
frequent
+ precise
+ statically detectable
+ no maintained equivalent
+ stable canonical correction
```

```text
Specify: exact invalid form · architectural reason
Prove: BAD cases · valid counterexamples · unsupported cases
Detect: narrowest syntax · scope · path
Report: root cause · canonical correction
```

Suppress only an irreducible boundary: narrow, inline, reasoned.
