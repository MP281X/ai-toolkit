## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.

## Verification

- After repository changes: `vp run fix && vp run check && vp run test`; resolve related failures at their shared cause.

## Communication

- Current evidence only; do not imply unperformed work.
- Information delta only: unrecoverable facts, permanent guidance, named artifacts, or task state. Compact Markdown.
- Delegation packets contain only the role, its named input or artifact, and authority that cannot be recovered from the checkout. Do not copy repository facts, rationale, histories, or shared instructions.

## Planning

- The root worktree task owns user dialogue, research, planning, approval, and delivery coordination.
- Research recoverable facts before asking only decision-changing questions. Present alternatives, tradeoffs, compatible combinations, and a recommendation.
- Require explicit approval of the complete decision plan before changing an issue or starting implementation. Persist approved intent, objectives, decisions, rationale, scope, acceptance behavior, and material rejected alternatives in one canonical issue.
- User-facing plans, issues, commits, and pull requests describe outcomes, not the delivery process.

## Delivery

- One root worktree task is the only permanent planner and orchestrator. It does not implement, test, review, or change Git/GitHub state.
- Delegate Git/GitHub state to a fresh `git_operations` subagent. Delegate implementation to one resumable `implementation` subagent in the same checkout; it is the sole writer.
- After implementation stops, run a fresh `tester`. Return accepted in-scope defects to the same implementation subagent, then repeat acceptance with a fresh tester.
- After clean acceptance, run a fresh blind `reviewer` on the complete branch against its immediate base. Return accepted in-scope defects to implementation, then repeat clean acceptance and complete review with fresh subagents.
- Only after clean acceptance and one clean complete-branch review may a fresh `git_operations` subagent publish the approved state.
- No role runs concurrently with the sole writer. Testers and reviewers never edit production files. Every accepted review fix invalidates prior acceptance and review.
- A user finding returns the pull request to draft and resumes the same root and implementation tasks. Never automate GitHub review comments or CI polling.
- Humans merge. Permanent tasks remain unarchived and unpinned in last-activity order; add `CLOSED` to completed task titles and remove it when work resumes.
