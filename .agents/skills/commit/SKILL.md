---
name: commit
description: Use when the user asks the agent to create and push a git commit from local changes.
---

# Commit

Create a commit and push it.

## Workflow

1. Inspect `git status --short`
2. Inspect the full local diff against `HEAD`
3. Draft a concise commit message from the local changes
4. Run `git add -A`
5. Commit
6. Push the current branch

## Message

Use this subject format:

```text
<prefix>: <imperative description>
```

Prefixes:

- `feat`: new capability
- `fix`: bug fix
- `refactor`: restructuring without behavior change
- `perf`: performance improvement
- `chore`: dependencies, config, tooling
- `docs`: documentation
- `test`: tests
- `ci`: CI/CD
- `style`: formatting only

Keep the subject under 72 characters. Add a short bullet body only when the subject cannot explain the change.

## Constraints

- Treat staged and unstaged changes as one local change set
- Include untracked files that belong to the requested change
- Never force-push
- Report the commit hash and pushed branch
