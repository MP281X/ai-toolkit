# Static enforcement

**Boundary:** Put mechanically detectable behavior in static enforcement and semantic behavior in a skill.

## Own

| Tool                      | Active owner                           | Available rules or source        |
| ------------------------- | -------------------------------------- | -------------------------------- |
| TypeScript                | `tsconfig.json`                        | `typescript` reference           |
| Generic Oxlint · Oxfmt    | `vite.config.ts`                       | `oxc` and `vite-plus` references |
| Advanced anti-slop checks | `tools/linter/src/config.ts`           | `deslop-linter`                  |
| Fallow                    | `.fallowrc.json` · root `check` script | `fallow` reference               |
| Custom Oxlint             | `tools/linter/src/oxlint-plugin.ts`    | colocated tests                  |

## Selection

```mermaid
flowchart TD
	S{Configured maintained rule?} -->|Yes| C[Use configured rule]
	S -->|No| O{Compatible maintained option?}
	O -->|Yes| M[Use maintained option]
	O -->|No| X{Custom Oxlint applicable?}
	X -->|Yes| L[Use custom Oxlint]
	X -->|No| D[Route to domain skill]
```

Add custom Oxlint only when every gate is satisfied:

| Gate       | Requirement                   |
| ---------- | ----------------------------- |
| Frequency  | Frequent                      |
| Detection  | Precise and static            |
| Ownership  | No maintained equivalent      |
| Correction | Stable canonical construction |

| Evidence    | Requirement                                           |
| ----------- | ----------------------------------------------------- |
| Defect      | Exact invalid form and architectural reason           |
| Proof       | Failing fixtures and valid counterexamples            |
| Boundary    | Unsupported cases and narrowest syntax and path scope |
| Correction  | One canonical Construction                            |
| Suppression | Irreducible, narrow, inline, and reasoned             |
