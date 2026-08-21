---
name: prototype
description: 'Use for planning, prototyping, brainstorming, or resolving ambiguous requirements and design before implementation. Do not use for directly actionable work without material ambiguity.'
---

## Flow

```mermaid
sequenceDiagram
    participant U as User
    participant P as Primary
    participant R as Research

    U->>P: Requirement or feedback
    P->>R: Unresolved factual question
    R-->>P: Findings and sources
    P->>U: Viable choices beside each decision
    U->>P: Resolve decisions
    P->>P: Edit and validate approved Contract
    alt Implementation defect
        P->>P: Correct within Contract
    else Design becomes unresolved
        P->>U: Decision with viable choices
    else Complete
        P-->>U: Changed and Next
    end
```

## Collaboration

| Condition                                         | Required action                                           |
| ------------------------------------------------- | --------------------------------------------------------- |
| Planning, prototyping, or brainstorming requested | Return the design artifact; edit only after approval.     |
| Unresolved requirement or design                  | Keep the question beside the blocked decision.            |
| Approved Contract needs a material design change  | Return the changed design for approval.                   |
| Safe checkpoint                                   | Primary edits and validates immediately without approval. |

## Result

For each unresolved decision, use:

```markdown
## <Decision>

### A — <name>

- **Change:** Materially viable Construction.
- **Tradeoff:** Decision-changing cost.

### B — <name>

- **Change:** Materially viable Construction.
- **Tradeoff:** Decision-changing cost.
```

The alternatives are the implicit selection question. Add an explicit shared question directly under its decision only when the user must provide information that the alternatives cannot express.
