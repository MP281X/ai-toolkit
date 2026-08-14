---
name: git-operations
description: 'Use before every Git or GitHub interaction, including reads, mutations, conflicts, and message drafting.'
---

Every mutation requires an explicit request for that exact operation. Never infer another Git or GitHub operation: a commit request authorizes no branch, push, issue, or pull request. Ready and merge remain user-owned.

## Safety

| Operation                                | Invariant                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Read                                     | non-mutating inspection                                                   |
| Any mutation                             | exact explicit request; resolve target; inspect related state             |
| Default branch                           | read-only without explicit operation-specific authority                   |
| Reset · discard · delete · local rewrite | explicit request and exact target                                         |
| Published branch                         | preserve history; add normal commits                                      |
| Conflict                                 | issue-required behavior and current APIs; never choose one side wholesale |

Never commit, push, create or switch branches, create or edit issues or pull requests, merge, reset, discard, delete, or rewrite Git state without exact authority.

## GitHub

Infer the repository from the checkout. Use an enabled GitHub workflow for covered operations; otherwise use `gh`. Create or edit an issue only after an explicit request. When a pull request closes an issue, do not close the issue separately.

## Branches

```text
one semantic change → one branch → one pull request
independent branch → fetched remote default branch
dependent branch → immediate preceding stack branch
```

## Route

Read every matching reference completely once before acting. Open the linked path directly relative to this `SKILL.md`; never list, glob, grep, or search this skill directory. Continue a read only when the tool reports truncation.

| Work                                                                   | Reference                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| Issue, commit, or pull-request text                                    | [Messages](references/messages.md)                 |
| Stack creation, publication, alignment, merge recovery, or retargeting | [Stacked pull requests](references/stacked-prs.md) |

## Output

Return only the requested Git or GitHub artifact, resulting state, or material blocker.
