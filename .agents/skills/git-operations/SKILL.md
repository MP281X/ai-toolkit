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

Infer the repository from the checkout. Use an enabled GitHub workflow for covered operations; otherwise use `gh`. Create or edit an issue only after an explicit request. When a pull request closes an issue, do not close the issue separately.

## Branches

```text
one semantic change → one branch → one pull request
independent branch → fetched remote default branch
dependent branch → immediate preceding stack branch
```

## Route

| Work                                                                | Read                        |
| ------------------------------------------------------------------- | --------------------------- |
| Issue, commit, or pull-request text                                 | `references/messages.md`    |
| Stack creation, publication, alignment, merge recovery, retargeting | `references/stacked-prs.md` |
