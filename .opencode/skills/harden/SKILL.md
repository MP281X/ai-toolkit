---
name: harden
description: 'Use only when the user explicitly asks to harden, finalize, or make an accepted result production-ready.'
---

```mermaid
flowchart LR
    A[Explicit request] --> C[Cleanup and reconcile]
    C --> V[Validate]
    V --> R[Review and rendered acceptance]
    R --> D{Defects?}
    D -->|Yes| C
    D -->|No| F[Complete]
```

| Lead      | Rule                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| Reconcile | Remove abandoned alternatives, dead paths, temporary compatibility, and governing-rule violations. |
| Dispatch  | Give each independent proof to Review and rendered acceptance to Browser in parallel.              |
| Correct   | Primary corrects defects within the accepted Contract.                                             |
| Aggregate | Deduplicate defects; readiness requires every dispatched proof and acceptance to pass.             |
| Repeat    | Repeat project validation and only acceptance or proof questions affected by a correction.         |
