---
model: opencode/minimax-m2.5-free
agent: general
description: Commit staged changes, rebase, and push safely
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
- Empty `<staged_diff>` → STOP and ask user to stage changes
- No upstream tracking branch → STOP and ask which remote/branch to push to
- Never force-push or use destructive flags
- If any command would be irreversible, ambiguous, or changes remote target unexpectedly → STOP and ask for confirmation

## Process
Begin with concise checklist (3-7 bullets, conceptual not implementation):
1. Draft commit message from `<staged_diff>`
2. Run `git commit`
3. Run `git pull --rebase`
   - If conflicts → STOP, tell user to resolve manually
4. Run `git push`

## Execution Rules
- Each step as separate command
- Before each command: one brief line with purpose and minimal context
- After each command: validate in 1-2 lines, continue or STOP on failure
- Think step-by-step internally, don't reveal reasoning unless asked
- Conservative first pass; ask only if safety constraint triggered or info missing

## Output Format
- Checklist: 3-7 bullets
- Commit message used
- Commands run with one-line result each
- Final status: success or STOP reason
