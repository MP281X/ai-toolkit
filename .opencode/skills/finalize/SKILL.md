---
name: finalize
description: 'Use only after the user explicitly says the current product or Workflow result is satisfactory or asks to finalize, harden, reconcile, or make it production-ready.'
---

```mermaid
flowchart LR
	F[Freeze accepted Contract] --> C[Resolve Candidate through git-operations]
	C --> R[Reconcile Coupled paths]
	R --> V[Run validation]
	V --> W{Workflow changed?}
	W -->|Yes| S[Require OpenCode restart]
	W -->|No| D[Decompose independent acceptance and proof questions]
	S --> D
	D --> B[Parallel bounded Browser acceptance when UI changed]
	D --> A[Parallel bounded Assurance proofs]
	B --> G{Every applicable proof passed?}
	A --> G
	G -->|No| R
	G -->|Yes| P[Report readiness]
```

| Lead      | Rule                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| Reconcile | Remove abandoned alternatives, dead paths, temporary compatibility, and governing-rule violations. |
| Restart   | After an agent, skill, instruction, or configuration change, stop until OpenCode restarts.         |
| Dispatch  | Give each independent acceptance or proof question to a fresh applicable agent in parallel.        |
| Aggregate | Deduplicate defects; readiness requires every dispatched proof and acceptance to pass.             |
| Repeat    | Repeat project validation and only acceptance or proof questions affected by a correction.         |
