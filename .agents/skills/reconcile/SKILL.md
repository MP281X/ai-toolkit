---
name: reconcile
description: 'GitHub issue as desired state; complete current worktree and pull request from any partial state.'
---

The issue body is immutable desired state. Reconciliation starts from whatever exists and ends with one verified implementation path and a ready pull request.

## Source of truth

Require a GitHub repository issue URL. Read the issue body, current behavior, consumers, tests, pull request, and issue-relative diff.

Ignore checkboxes, prior completion claims, implementation history, and previous review conclusions. Stop when product behavior, public interfaces, scope, or material risk remains ambiguous.

## Process

1. **Ground the branch.** Confirm the worktree is off the default branch. Discover the linked pull request and return it to draft when implementation resumes.
2. **Reconcile the behavior.** Implement every issue-owned requirement and nothing speculative. Remove issue-owned temporary paths, compatibility layers, superseded variants, stale exports, and dead tests.
3. **Establish the draft.** Once the branch has a coherent commit, create or update the linked draft pull request.
4. **Verify the result.** Run repository verification. For UI changes, collect rendered evidence for every material state.
5. **Audit independently.** Review the complete issue-relative diff from scratch. Resolve every valid finding, then repeat affected verification.
6. **Publish the final state.** Commit intentional remaining changes, push, update the pull-request body, and mark it ready only when every requirement and gate passes.

## Completion

The issue, implementation, tests, rendered behavior, commits, and pull-request body describe the same accepted state. No actionable finding remains.
