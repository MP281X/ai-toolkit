---
name: git-operations
description: 'Use for every Git or GitHub read or mutation.'
---

## Safety

| Operation group                         | Invariant                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Entirely read-only                      | No approval required                                                                            |
| Contains any mutation                   | Resolve every operation and target, then require explicit approval for the complete exact group |
| Successive or adjacent operation        | Requires new explicit approval; authority never carries forward                                 |
| Protected or long-lived branch mutation | Requires explicit operation-specific approval                                                   |
| Reset, discard, delete, or rewrite      | Require an explicit request and exact resolved target                                           |
| Published branch                        | Never rebase, amend, squash, reset, or force-push                                               |
| Conflict                                | Resolve from intended final state and current source, never by choosing a side mechanically     |

| Lead       | Rule                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Repository | Infer it from the checkout; use installed `git` and `gh`.                                                     |
| Issue      | Keep it open until the pull request that owns its closure merges.                                             |
| Change     | Keep one semantic change per branch and pull request.                                                         |
| Base       | Use the fetched remote default branch for independent work and the immediate stack parent for dependent work. |

## Conditional references

| Work                                                                               | Reference                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Branch, commit, issue, or pull-request naming and text                             | [Conventions](references/conventions.md)           |
| Stack creation, publication, alignment, merge recovery, or retargeting             | [Stacked pull requests](references/stacked-prs.md) |
| Exact remote preservation before replacement, deletion, rebase, or Workflow change | [Snapshot tag](references/snapshot-tag.md)         |

**Result:** Return the requested Git artifact or resulting state with exact refs and revisions.
