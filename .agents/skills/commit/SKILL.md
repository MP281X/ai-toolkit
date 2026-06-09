---
name: commit
description: Use when the user asks the agent to create and push a git commit from local changes.
---

# Commit

## Flow

1. Inspect `git status --short`
2. Inspect full `HEAD` diff, including untracked files
3. Draft message from diff
4. Run `git add -A`
5. Commit
6. Push current branch

## Message

- Match repo history
- Prefer:

```text
<type>: <imperative summary>
```

- Types: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `style`
- Subject <= 72 chars
- Body only for non-obvious scope, risk, or rationale

## Guardrails

- Include relevant untracked files
- No force-push
- Report hash and branch
