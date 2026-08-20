# Snapshot Tag

```mermaid
flowchart LR
	R[Resolve source + commit + tag + remote] --> N{Tag name resolved?}
	N -->|No| P[Propose purpose-derived name]
	N -->|Yes| A{Safety gate passed?}
	P --> A
	A -->|No| X[Stop]
	A -->|Yes| T[Create annotated tag]
	T --> U[Push only tag]
	U --> V[Verify remote peeled target]
```

| Field             | Rule                                                |
| ----------------- | --------------------------------------------------- |
| Source            | Current branch unless the user names another source |
| Tag               | `snapshot/<scope>/<kebab-case-name>`                |
| Approval evidence | Source, exact commit, destination tag, and remote   |
| Result            | Remote tag, verified commit, and preservation risk  |

```mermaid
flowchart LR
	D[Resolve exact branch deletion target] --> P{Preservation verified?}
	P -->|No| X[Stop]
	P -->|Yes| A{Safety gate passed?}
	A -->|No| X
	A -->|Yes| C[Delete branch]
```
