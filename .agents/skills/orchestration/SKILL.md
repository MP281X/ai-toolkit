---
name: orchestration
description: 'Manually invoke for a new deslop brief; return an approved canonical issue and role-owned delivery through independent acceptance and review without implementing, evaluating, or changing Git/GitHub state.'
---

# Ownership

The root worktree task owns user dialogue, research synthesis, decisions, approval, phase order, role dispatch and concurrency, named artifact flow, finding adjudication, invalidation and retry, task titles, and final self-review collection. It does not implement, evaluate, or change Git/GitHub state.

Keep the root as primary advisor. Delegate repository reads aggressively to `explorer`; delegate independent or output-heavy external research to fresh general agents. Run independent investigations in parallel. For consequential choices, material uncertainty, or likely anchoring, a fresh general agent may challenge the current answer. No permanent advisor role; no routine adversarial call.

# Approval

Before approval:

- Research recoverable facts.
- Challenge the user's assumptions and your own.
- Present material alternatives, tradeoffs, compatible combinations, and a recommendation.
- Ask only questions whose answers change the decision.

Require explicit approval of the complete decision plan before changing an issue or starting implementation. After approval, dispatch `git_operations` with the approved plan to create or update one canonical issue containing approved intent, objectives, decisions, rationale, scope, acceptance behavior, and material rejected alternatives.

After issue creation, title the root task `#<issue> | <exact issue title>`. After the pull request is ready for human review, title it `#<issue> ✓ | <exact issue title>`. No other completion marker is valid; resumed work restores the active title.

# Delivery

Run one delivery role at a time. Use one resumable `implementation` agent for the issue; all other delivery roles are fresh.

1. Dispatch `implementation` with the canonical issue URL.
2. Dispatch `tester` with the issue URL. Adjudicate findings; return accepted defects to the same implementation agent, then repeat with a fresh tester.
3. After clean acceptance, dispatch `git_operations` for a local candidate and retain its named base ref, base SHA, and head SHA artifact.
4. Dispatch a fresh `tester` with the issue URL and head SHA.
5. Dispatch `reviewer` with `fork_turns="none"`, the base SHA, and the head SHA.
6. Return accepted defects to implementation. Every accepted fix invalidates prior acceptance, candidate head, and review; restart from tester acceptance.
7. After clean committed-candidate acceptance and review, dispatch `git_operations` with the named base ref, base SHA, and head SHA for publication.

A user finding dispatches `git_operations` to return the pull request to draft, then resumes the same root and implementation tasks. Restore a resolved root task when work resumes. Archive merged or otherwise resolved root tasks; delivery roles are not permanent sidebar tasks.

# Self-review

Collect every agent's `Self-review`, add root-observed user corrections or frustration and the root's own findings, and deduplicate once at the end of the session.

- Product defects: return to the active implementation agent.
- Workflow defects: send the single deduplicated set once to a fresh `self_improvement` subagent.
