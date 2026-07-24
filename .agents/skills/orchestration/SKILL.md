---
name: orchestration
description: 'Manually invoke for a new deslop brief; return an approved canonical issue and role-owned delivery through independent acceptance and review without implementing, changing Git/GitHub state, or merging.'
---

# Ownership

The root worktree task owns user dialogue, research synthesis, planning, approval, decisions, phase control, finding adjudication, and delivery coordination. It does not implement, test, review, or change Git/GitHub state.

Keep the root as primary advisor. Delegate repository reads aggressively to `explorer`; delegate independent or output-heavy external research to fresh read-only general agents. Run independent investigations in parallel. For consequential choices, material uncertainty, or likely anchoring, a fresh read-only general agent may challenge the current answer. No permanent advisor role; no routine adversarial call.

# Approval

Before approval:

- Research recoverable facts.
- Challenge the user's assumptions and your own.
- Present material alternatives, tradeoffs, compatible combinations, and a recommendation.
- Ask only questions whose answers change the decision.

Require explicit approval of the complete decision plan before changing an issue or starting implementation. After approval, delegate Git/GitHub mutation to a fresh `git_operations` agent and persist one canonical issue containing approved intent, objectives, decisions, rationale, scope, acceptance behavior, and material rejected alternatives. User-facing plans, issues, commits, and pull requests describe outcomes, not delivery mechanics.

After issue creation, title the root task `#<issue> | <exact issue title>`. After the pull request is ready for human review, title it `#<issue> ✓ | <exact issue title>`. No other completion marker is valid; resumed work restores the active title.

# Delivery

Use one resumable `implementation` agent in the root checkout as sole writer. Give it only the approved issue URL and implementation role. No evaluator or Git agent runs concurrently with the writer.

Run `tester`, `reviewer`, and `self_improvement` through their registered fresh subagent roles. Their no-edit boundary is a role contract; do not claim filesystem isolation when the root's live permission override is inherited.

After implementation stops:

1. Run a fresh `tester` subagent under its non-mutating acceptance contract, followed by focused changed-behavior checks. It may load `agent-browser` directly and never edits production files.
2. Adjudicate findings against the canonical issue. Return accepted in-scope defects to the same implementation agent, then repeat acceptance with a fresh tester.
3. After clean acceptance, delegate a local candidate commit to a fresh `git_operations` agent. Record its returned named base ref, immutable base SHA, and immutable head SHA; do not push.
4. Run a fresh `tester` subagent for complete non-mutating acceptance of the committed candidate. Its packet contains the tester role, canonical issue URL, and head SHA. Require the checkout to remain clean at that exact head.
5. Run a fresh blind `reviewer` subagent with `fork_turns="none"` on exactly those base and head SHAs. Its packet contains only the reviewer role and both SHAs; do not provide the plan, rationale, earlier findings, or fix history.
6. Return accepted in-scope defects to implementation. Every fix invalidates all prior acceptance, candidate head, and review; repeat from acceptance with fresh agents.
7. Only after clean committed-candidate acceptance and one clean review of the exact base/head pair, delegate push and pull-request state to a fresh `git_operations` agent. The named base ref must still resolve to the reviewed base SHA.

Never automate GitHub review comments or CI polling. Humans merge.

A user finding delegates the pull request's return to draft to a fresh `git_operations` agent, then resumes the same root and implementation tasks. Restore a resolved root task when work resumes. Archive merged or otherwise resolved root tasks; subagents remain ephemeral and are not represented by permanent sidebar tasks.

# Self-review

Collect every agent's `Self-review`, add root-observed user corrections or frustration and the root's own findings, and deduplicate once at the end of the session.

- Product defects: return to the active implementation agent.
- Workflow defects: send the single deduplicated set once to a fresh `self_improvement` subagent.

Do not invoke self-improvement recursively. Its repository correction proposals require explicit approval and the normal implementation, acceptance, and review sequence.
