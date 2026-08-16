# Snapshot tag

```mermaid
flowchart LR
    S[Resolve source branch, exact commit, tag, and remote] --> N{Name approved?}
    N -->|No| P[Propose purpose-derived names]
    N -->|Yes| A[Request Git mutation approval]
    P --> A
    A --> T[Create annotated tag on approved commit]
    T --> U[Push only the tag]
    U --> V[Verify remote peeled target]
```

| Field             | Rule                                                |
| ----------------- | --------------------------------------------------- |
| Source            | Current branch unless the user names another source |
| Tag               | `snapshot/<scope>/<kebab-case-name>`                |
| Approval evidence | Source, exact commit, destination tag, and remote   |
| Result            | Remote tag, verified commit, and preservation risk  |

**Deletion:** A replaced branch requires verified preservation and a separate approved Git mutation.
