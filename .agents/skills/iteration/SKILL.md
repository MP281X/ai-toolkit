---
name: iteration
description: 'Use for every request and follow-up during iterative discussion and implementation.'
---

```mermaid
flowchart LR
    O[Infer root outcome] --> C{Material choice?}
    C -->|Yes| S[Compare 2–4 ingredients and recommend synthesis]
    C -->|No| E[Define smallest useful experiment]
    S --> E
    E --> A[Obtain explicit experiment approval]
    A --> I[Invoke applicable domain skills]
    I --> F[Return usable Candidate for feedback]
    F --> O
    F -->|Result approved or finalization requested| Z[Finalize]
```

| Lead     | Rule                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Question | Ask only unresolved questions that can change the experiment; ask independent questions together.                    |
| Exclude  | Define revised dimensions and material exclusions before approval.                                                   |
| Surface  | Present a simpler mechanism when evidence supports it.                                                               |
| Defer    | Put an unrequested possibility in a `> [!NOTE]` callout labeled `Outside current scope`; discard it unless selected. |
