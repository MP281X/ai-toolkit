---
description: Generate commit message from staged changes and plans. Commit, rebase, push.
model: opencode-go/minimax-m2.7
agent: general
---

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
!`git diff --staged -- . ':!bun.lock' ':!.opencode/plans'`
</staged_diff>

<recent_plans>
!`ls -t .opencode/plans/*.md 2>/dev/null | head -5 | xargs -I {} sh -c 'echo "--- {} ---" && head -20 {}'`
</recent_plans>

## Commit Prefixes

- feat: New features, capabilities, functionality
- fix: Bug fixes, error corrections
- refactor: Code restructuring without behavior change
- perf: Performance improvements
- chore: Maintenance: deps, config, tooling changes
- docs: Documentation changes
- test: Test additions or modifications
- ci: CI/CD configuration changes
- style: Formatting, whitespace, semicolons only

## Commit Message Rules

Subject: `<prefix>: <imperative description>` (<= 72 chars, main task only)
Body: Optional bullets for extra details

## Safety

- Never force-push
- Unstaged changes are normal - don't treat as error

## Process

1. Draft commit message from diff + plans
2. `git commit -m "subject" [-m "body"]`
3. `git push`
