---
name: git-operations
description: 'Use for every Git or GitHub read or mutation.'
---

## Safety

| Operation                                | Invariant                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Any mutation                             | Resolve the exact operation and target; inspect relevant state and topology; preserve unrelated changes |
| Default branch                           | Read-only without explicit operation-specific authority                                                 |
| Reset, discard, delete, or rewrite       | Require an explicit request and exact resolved target                                                   |
| Published branch                         | Never rebase, amend, squash, reset, or force-push                                                       |
| Conflict                                 | Resolve from intended final state and current source, never by choosing a side mechanically             |
| Commit, push, issue, PR, ready, or merge | Each requires separate explicit authority; never infer the next operation                               |

Infer the repository from the checkout. Use the installed Git and `gh` interfaces. Keep an issue open until the pull request that owns its closure merges.

Keep one semantic change per branch and pull request. Base independent work on the fetched remote default branch and dependent work on its immediate stack parent.

## Conditional references

- Branch, commit, issue, or pull-request naming and text → [Conventions](references/conventions.md)
- Stack creation, publication, alignment, merge recovery, or retargeting → [Stacked pull requests](references/stacked-prs.md)
- Preserving a branch or revision before replacement, deletion, rebase, or workflow change → [Archive branch](references/archive-branch.md)

Return only the requested artifact, resulting state, or material blocker.
