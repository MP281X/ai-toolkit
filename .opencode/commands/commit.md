---
description: Commit staged changes, rebase, push.
model: github-copilot/gpt-5-mini
---

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

## Prefixes
- `feat:` new feature
- `fix:` bug fix
- `refactor:` restructuring
- `perf:` performance
- `chore:` maintenance (deps/config)
- `docs:` documentation
- `test:` tests
- `ci:` CI/CD
- `style:` formatting only

## Commit message
- Subject: `<prefix>: <what was accomplished>` — imperative, concise, <= 72 chars
- Body: optional — bullet list with extra detail only when needed
- Use `<request>` only if it's consistent with `<staged_diff>`

## Safety
- In-progress rebase/merge/cherry-pick → STOP and report
- Empty `<staged_diff>` → STOP and ask user to stage changes
- No upstream tracking branch → STOP and ask which remote/branch to push to
- Never force-push or use destructive flags

## Process
1. Draft commit message from `<staged_diff>`
2. Run `git commit` (do not chain with other commands)
3. Run `git pull --rebase` — if conflicts: STOP and tell user to resolve manually
4. Run `git push`

Note: execute each step as a separate command

## Output
- Commit message used
- Commands run + one-line result each
- Final status (success or STOP reason)
