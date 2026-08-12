---
name: git-operations
description: 'Use when mutating Git or GitHub state: branches, commits, issues, pull requests, stacks, or conflicts.'
---

## Safety

| Operation                                | Invariant                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Any mutation                             | explicit request for exact operation; resolve target; inspect related state |
| Default branch                           | read-only without explicit operation-specific authority                     |
| Reset · discard · delete · local rewrite | explicit request and exact target                                           |
| Published branch                         | preserve history; add normal commits                                        |
| Conflict                                 | issue-required behavior and current APIs; never choose one side wholesale   |

## GitHub

Infer the repository from the checkout. Use an installed GitHub workflow for covered operations; use `gh` only for gaps. Keep an issue open until its closing pull request merges.

## Branches

```text
one issue → one semantic branch → one pull request
independent branch → fetched remote default branch
dependent branch → immediate preceding stack branch
```

## Route

| Work                                                                | Read                        |
| ------------------------------------------------------------------- | --------------------------- |
| Commit or pull-request text                                         | `references/messages.md`    |
| Stack creation, publication, alignment, merge recovery, retargeting | `references/stacked-prs.md` |
