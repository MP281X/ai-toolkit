---
name: git-operations
description: 'Use when mutating Git or GitHub state: branches, commits, issues, pull requests, stacks, or conflicts.'
---

## Safety

| Operation                          | Invariant                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Any mutation                       | resolve target; inspect status and relevant remote/PR/stack; preserve unrelated changes     |
| Default branch                     | read-only without explicit operation-specific authority                                     |
| Reset/discard/delete/local rewrite | explicit request and exact resolved target                                                  |
| Published branch                   | no rebase, amend, squash, reset, or force-push                                              |
| Conflict                           | resolve from intended final state and current source, never by choosing a side mechanically |
| Ready/merge                        | user-owned                                                                                  |

## GitHub

Use `gh`. Infer the repository from the checkout; inspect the current branch pull request with `gh pr view`. Create/edit issues with `gh issue create|edit`. Keep an issue open until its closing pull request merges.

## Branches

- One issue → one short semantic branch → one pull request.
- No agent/tool branch prefix.
- Independent branch → fetched remote default branch.
- Dependent branch → immediate preceding stack branch.

## Conditional reference

- Commit/pull-request text → `references/messages.md`
- Stack creation, publication, alignment, merge recovery, or retargeting → `references/stacked-prs.md`
