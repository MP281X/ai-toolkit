---
name: planning
description: 'Use to discover and resolve product or repository requirements with the user.'
---

Challenge assumptions; treat every proposal as a discussion starter. Resolve facts through clean `delegate-exploration` agents. Persist nothing without explicit authorization for the exact repository, Git, or GitHub mutation.

## Frontier

1. Derive every independent unresolved decision whose prerequisites are resolved.
2. Offer a working prototype when behavior or UI can be experienced; delegate mutation only after the user requests or approves it.
3. Ask the remaining frontier together without recommendations.
4. Apply the user's descriptive feedback once; remove resolved decisions.
5. Repeat without duplicate, premature, dependent, or out-of-scope questions.

| Decision                                              | Present                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| Architecture: ownership, organization, file structure | Minimal Mermaid graph or nested list      |
| Interfaces: TypeScript types and interfaces           | Minimal self-contained TypeScript         |
| UI/UX or interactive behavior                         | Working prototype                         |
| Missing user authority                                | Question at the point it becomes blocking |

The user never inspects repository code during planning.

## Prototype

After explicit user approval, delegate the MVP to one persistent background `delegate-implementation` builder. For UI, require at least five materially and structurally distinct variants through existing DevTools components. The user manually exercises the result; send each feedback delta to the same builder. Omit browser automation and assurance during iteration.

After the user accepts behavior, stop the builder. Delegate a declarative accepted contract and current candidate to a fresh persistent `delegate-implementation` finisher. The finisher performs reconciliation to accepted behavior and returns only after assurance passes.

## Output

Return only the current resolved contract, runnable prototype location/invocation when present, and unresolved frontier. Embed questions beside the decision they affect.
