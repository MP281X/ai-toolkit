---
name: orchestration
description: 'Invoke only as `$orchestration` for a new deslop brief; return an approved canonical issue and role-owned delivery without implementing, evaluating, or changing Git/GitHub state.'
---

# Ownership

The root owns dialogue, research synthesis, decisions, approval, phase order, role dispatch and concurrency, named artifact flow, finding adjudication, invalidation and retry, task titles, and final self-review collection. It does not implement, evaluate, or change Git/GitHub state.

Use explorers for repository facts and fresh general agents for independent external research or consequential challenge. Run independent work in parallel. No permanent delivery or advisory tasks.

# Approval

Before approval:

- Research recoverable facts.
- Challenge the user's assumptions and your own.
- Present material alternatives, tradeoffs, compatible combinations, and a recommendation.
- Ask only questions whose answers change the decision.

Require explicit approval of the complete decision plan before issue mutation or implementation. Then dispatch `git_operations` to create or update one canonical issue with approved intent, decisions, rationale, scope, acceptance, and material rejected alternatives.

After issue creation, title the root task `#<issue> | <exact issue title>`. After the pull request is ready for human review, title it `#<issue> ✓ | <exact issue title>`. No other completion marker is valid; resumed work restores the active title.

# Delivery

Run one delivery role at a time. Every initial `implementation`, `tester`, `reviewer`, and `self_improvement` dispatch uses `fork_turns="none"` and passes only named artifacts and authority not recoverable from the checkout; never include the registered agent role. Keep one named implementation agent; resume it only for accepted fixes. All other delivery roles are fresh.

1. Dispatch `implementation` with the canonical issue URL.
2. Dispatch `tester` with the issue URL and retain its complete-scope findings without starting a correction.
3. Consolidate all available tester, advisor, self-review, workflow, and scope findings once; dispatch `self_improvement` with the issue URL and deduplicated workflow subset.
4. Adjudicate the complete pre-freeze set against the immutable canonical issue. Map every finding to an existing clause and the acceptance, review, runtime, or identity evidence it affects. Reject or defer anything outside the contract; retain useful outside-contract observations only as follow-up evidence.
5. Aggregate every accepted finding and resume the named implementation agent once for one correction pass. Do not serialize corrections for findings that were jointly available. Dispatch a fresh `tester` after the pass; a newly discovered in-contract product defect may resume implementation only when its supporting evidence was not available for the aggregate.
6. Dispatch `git_operations` for a local candidate; retain its named base ref, base SHA, and head SHA.
7. Dispatch a fresh `tester` with the issue URL, base SHA, and head SHA.
8. Dispatch `reviewer` with the base SHA and head SHA.
9. Adjudicate later findings against the same contract. Return accepted product defects to the named implementation agent and rebuild the candidate; defer outside-contract and non-invalidating observations as follow-up evidence.
10. After clean committed-candidate acceptance and review, dispatch `git_operations` with the named base ref, base SHA, and head SHA for publication.

The approved canonical issue is the immutable scope contract. Only an explicit user decision may add, remove, or alter scope.

A correction invalidates only evidence whose changed surface or assumption depends on that correction. Reuse valid evidence for unchanged inputs and for surfaces restored exactly to the reviewed base. Any candidate-tree change requires refreshed candidate identity and complete-diff review, but does not invalidate unaffected focused evidence. Product defects, candidate drift, changed base identity, checkout mutation, acceptance failures, and review defects invalidate only their dependent evidence and required identity checks.

A user finding dispatches `git_operations` to return the pull request to draft, then resumes the root and named implementation agent.

# Self-review

Collect every agent's `Self-review`, root-observed user corrections or frustration, and the root's own findings. The pre-freeze audit owns the delivery's single deduplication; retain later non-invalidating observations as follow-up evidence.
