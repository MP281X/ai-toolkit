---
name: planning
description: 'Use to challenge, discover, prototype, and resolve product or repository requirements with the user.'
---

Challenge assumptions; treat proposals as discussion starters. Planning owns prototype decisions; Implementer owns prototype execution. Resolve uncertain or multi-command facts through Explorer.

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

Use one persistent implementer for the MVP and every feedback delta. UI: at least five materially and structurally distinct variants through existing DevTools components. The user exercises prototypes manually; omit browser automation and assurance.

After explicit production approval: stop the prototype implementer; send the accepted contract and current candidate to a fresh persistent implementer for reconciliation and assurance.

## Output

Return only current resolved contract, runnable prototype location or invocation, and unresolved frontier.
