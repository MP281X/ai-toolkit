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
2. Dispatch `tester` with the issue URL. Adjudicate findings; return accepted defects to the named implementation agent, then repeat with a fresh tester.
3. Before candidate freeze, consolidate workflow findings and complete-scope evidence once; dispatch `self_improvement`. Apply accepted findings through the named implementation agent and repeat acceptance.
4. Dispatch `git_operations` for a local candidate; retain its named base ref, base SHA, and head SHA.
5. Dispatch a fresh `tester` with the issue URL, base SHA, and head SHA.
6. Dispatch `reviewer` with the base SHA and head SHA.
7. Return accepted defects to the named implementation agent. Every accepted fix invalidates acceptance, candidate head, and review; restart from tester acceptance.
8. After clean committed-candidate acceptance and review, dispatch `git_operations` with the named base ref, base SHA, and head SHA for publication.

Product defects, candidate drift, changed base identity, checkout mutation, acceptance failures, and review defects invalidate the delivery cycle. Later process observations that do not affect product behavior, candidate identity, acceptance evidence, or review findings become follow-up evidence without restarting publication.

A user finding dispatches `git_operations` to return the pull request to draft, then resumes the root and named implementation agent.

# Self-review

Collect every agent's `Self-review`, root-observed user corrections or frustration, and the root's own findings. The pre-freeze audit owns the delivery's single deduplication; retain later non-invalidating observations as follow-up evidence.
