---
description: Commit staged changes, rebase the current branch, and push safely.
model: github-copilot/gpt-5-mini
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

## Commit Prefixes
- `feat:` new feature
- `fix:` bug fix
- `refactor:` restructuring
- `perf:` performance
- `chore:` maintenance (deps/config)
- `docs:` documentation
- `test:` tests
- `ci:` CI/CD
- `style:` formatting only

## Commit Message Rules
- Subject: `<prefix>: <what was accomplished>` — imperative, concise, <= 72 chars
- Body: optional — bullet list with extra detail only when needed
- Use `<request>` only if it's consistent with `<staged_diff>`

## Safety Constraints
- In-progress rebase, merge, or cherry-pick → STOP and report
- Empty `<staged_diff>` → STOP and ask the user to stage changes
- No upstream tracking branch → STOP and ask which remote/branch to push to
- Never force-push or use destructive flags
- If any command would be irreversible, ambiguous, or would change a remote target unexpectedly, STOP and ask for explicit confirmation before proceeding

## Process
Begin with a concise checklist (3-7 bullets) of what you will do; keep items conceptual, not implementation-level.
1. Draft a commit message from `<staged_diff>`.
2. Run `git commit`.
3. Run `git pull --rebase`.
   - If conflicts occur, STOP and tell the user to resolve them manually.
4. Run `git push`.

## Execution Rules
- Execute each step as a separate command.
- Before each significant command, state one brief line with its purpose and minimal input context.
- After each command, validate the result in 1-2 lines and either continue or STOP if validation fails.
- Think step by step internally and do not reveal internal reasoning unless explicitly requested.
- Attempt a conservative first pass autonomously using the provided repo state; ask for clarification only if a safety constraint is triggered or required information is missing.

## Output Format
- Checklist: 3-7 bullets
- Commit message used
- Commands run, with a one-line result for each
- Final status: success or STOP reason
