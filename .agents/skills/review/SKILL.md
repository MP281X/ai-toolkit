---
name: review
description: 'Strict unbiased audit of one complete pull-request candidate against its issue and actual base.'
---

Review one diff:

```text
actual pull-request base → current worktree
```

The candidate includes all committed and uncommitted changes as one tree. For a stack, use the preceding branch; otherwise use the actual pull-request base or repository default branch.

Read the issue, base, and complete candidate from scratch. Treat implementation rationale, checklists, prior reviews, commit boundaries, and completion claims as untrusted.

Load the engineering skill, then every engineering reference applicable to the candidate. Enforce loaded rules as strict review invariants equivalent to static diagnostics. Repository files are read-only.

Search adversarially for:

1. contract gaps, incorrect behavior, regressions, edge states, and missing proof;
2. boundary drift, accidental complexity, stale paths, duplication, lifecycle defects, and simpler final shapes;
3. security, accessibility, responsiveness, loading, empty, failure, console, and network defects where applicable.

Report only evidence-backed actionable problems. Deduplicate by root cause and order by severity, then user impact. Each finding states violated behavior, evidence, location, and required correction.

Return `No actionable findings` only after every applicable pass and the complete candidate are clean.
