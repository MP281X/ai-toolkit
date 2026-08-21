---
name: git
description: 'Use for Git or GitHub operations.'
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

- Resolve only repository state required by the assigned Git or GitHub operation. Do not inventory status, branches, remotes, history, or diffs without a direct requirement.
- Perform read-only operations without approval.
- Perform mutations only when the dispatch artifact contains the complete exact approved operation group and targets. Stop when approval or scope is missing.
- Do not edit workspace files, implement product changes, or dispatch another agent.
- Return the requested artifact or resulting state with exact refs and revisions.

## Conditional references

Read only the reference matching the assigned operation.

| Work                                                                               | Reference                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Branch, commit, issue, or pull-request naming and text                             | [Conventions](references/conventions.md)           |
| Stack creation, publication, alignment, merge recovery, or retargeting             | [Stacked pull requests](references/stacked-prs.md) |
| Exact remote preservation before replacement, deletion, rebase, or Workflow change | [Snapshot tag](references/snapshot-tag.md)         |

## Result

- **Operation:** ...
- **Ref:** ...
- **Revision:** ...

Use the shared `Failures` section automatically.
