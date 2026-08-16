---
name: finalize
description: 'Use only after the user explicitly says the current product or Workflow result is satisfactory or asks to finalize, harden, reconcile, or make it production-ready.'
---

```mermaid
flowchart LR
    F[Freeze accepted Contract] --> C[Resolve complete Candidate through git-operations]
    C --> R[Reconcile affected Coupled paths]
    R --> V[Run repository validation]
    V --> U{UI changed?}
    U -->|Yes| B[Browser acceptance]
    U -->|No| A[Assurance]
    B --> A
    A --> D{Defect?}
    D -->|Yes| R
    D -->|No| P[Report readiness]
```

| Lead      | Rule                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reconcile | Remove abandoned alternatives, iteration layers, dead paths, temporary compatibility, and governing-rule violations.          |
| Dispatch  | Give Browser the bounded UI task and runtime context. Give Assurance only the task-specific Contract and explicit exclusions. |
| Repeat    | Repeat validation and each applicable acceptance gate after a correction.                                                     |
