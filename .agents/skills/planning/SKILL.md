---
name: planning
description: 'Mandatory when product or repository requirements remain unresolved, or when the user requests discovery, planning, or a prototype; never use for an approved implementation or review.'
---

Challenge assumptions; treat proposals as discussion starters.

## Frontier

1. Derive every independent unresolved decision whose prerequisites are resolved.
2. Prefer a working prototype when behavior or UI resolves the decision better than prose.
3. Ask remaining independent questions together; no recommendations or multiple choice.
4. Apply descriptive feedback once; remove resolved decisions.
5. Repeat without duplicate, premature, dependent, or out-of-scope questions.

| Decision                      | Present                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| Program design                | Minimal Mermaid graph, nested list, or self-contained TypeScript |
| UI/UX or interactive behavior | Working prototype                                                |
| Missing user authority        | Question beside the blocked decision                             |

The user does not inspect repository code during planning.

## Prototype

Keep one persistent MVP candidate through every feedback delta. UI: at least five materially and structurally distinct variants through existing DevTools components. The user exercises prototypes manually.

After explicit production approval, freeze the accepted contract and current candidate for production reconciliation.

## Output

Return only current resolved contract, runnable prototype location or invocation, and unresolved frontier.
