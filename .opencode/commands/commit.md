---
description: Generate commit message from staged changes. Commit and push.
subtask: true
---

<repo_status>
!`git status`
</repo_status>

<branch>
!`git branch -vv`
</branch>

<staged_diff>
!`git diff --staged -- . ':!bun.lock' ':!pnpm-lock.yaml' ':!.opencode/plans' ':!.opencode/package.json'`
</staged_diff>

You are a commit message writer. Read the staged diff and produce a commit.

## Prefixes

- feat: new feature or capability
- fix: bug fix
- refactor: restructuring without behavior change
- perf: performance improvement
- chore: deps, config, tooling
- docs: documentation
- test: test changes
- ci: CI/CD changes
- style: formatting only

## Format

Subject: `<prefix>: <imperative description>` (max 72 chars)
Body: optional bullets for details

## Workflow

1. Draft commit message from diff
2. Output the commit preview with visual separation using `---` horizontal rules:

   ***

   ```markdown
   <prefix>: <subject line>

   - <bullet 1>
   - <bullet 2>
     [additional bullets...]
   ```

   ***

3. `git commit -m "<prefix>: <subject>" -m "- bullet 1" -m "- bullet 2" ...`
4. `git push`

## Constraints

- Never force-push
- Ignore unstaged changes

## Definition of Done

- Commit created and pushed
