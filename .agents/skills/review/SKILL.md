---
name: review
description: 'Use when independently auditing the complete issue-to-candidate diff without editing repository files.'
---

| Candidate       | Base                       |
| --------------- | -------------------------- |
| Stack           | immediate preceding branch |
| Pull request    | actual pull-request base   |
| No pull request | default branch             |

Review committed, uncommitted, and untracked changes as one diff. Treat the issue as the contract. Read it, the base, candidate, and applicable engineering references from scratch; ignore implementation narrative, checklists, prior reviews, commit boundaries, and completion claims.

| Pass     | Search                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Contract | gaps, incorrect behavior, regression, edge state, missing proof                    |
| Design   | boundary drift, accidental complexity, stale path, duplication, lifecycle defect   |
| Product  | security, accessibility, responsiveness, loading, empty, failure, console, network |

Report only reproducible actionable problems. Deduplicate by root cause; order by severity, then user impact.

```text
[P0-P3] imperative finding — location
Violated behavior · evidence · required state
```
