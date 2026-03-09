---
description: Generate commit message from staged changes and plans. Commit, rebase, push.
model: opencode/minimax-m2.5-free
agent: general
---

## Request

commit and push


## Inputs

<request>
$ARGUMENTS
</request>

<repo_status>
!`git status`
</repo_status>

<branch_vv>
!`git branch -vv`
</branch_vv>

<staged_diff>
!`git diff --staged`
</staged_diff>

<recent_plans>
!`ls -t .opencode/plans/*.md 2>/dev/null | head -5 | xargs -I {} sh -c 'echo "--- {} ---" && head -20 {}'`
</recent_plans>


## Understanding the Task

Read staged_diff and recent_plans to understand what was accomplished:
- Main task/objective (from plan files if present)
- Key changes in the diff
- New features, refactors, fixes


## Commit Prefixes

```
feat:     New features
fix:      Bug fixes
refactor: Code restructuring without behavior change
perf:     Performance improvements
chore:    Maintenance (deps, config, tooling) - use in body only
docs:     Documentation
test:     Tests
ci:       CI/CD changes
style:    Formatting only
```


## Commit Message Rules

Subject: `<prefix>: <what was accomplished>` — imperative, concise, <= 72 chars
- Focus on main task. Omit minor changes (deps, formatting) from subject.
- Minor changes go in body if needed.
- Reference plan files if they clarify the objective.

Body: Optional bullet list for extra detail.


## Safety Constraints

- In-progress rebase/merge/cherry-pick → STOP and report
- No upstream tracking → STOP, ask which remote/branch to push
- Never force-push
- Irreversible/ambiguous commands → STOP and confirm

Unstaged changes are normal - the user may commit only part of their changes. Never treat this as an error.


## Process

1. Draft commit message from diff + plans
2. `git commit -m "subject" [-m "body"]`
3. `git pull --rebase` (conflicts → STOP, tell user to resolve)
4. `git push`


## Execution

- Each step as separate command
- Before each: one brief line with purpose
- After each: validate in 1-2 lines, continue or STOP on failure


## Output

- Commit message used
- Final status: success or STOP reason
