---
name: commit
description: Use when the user asks the agent to create and push a git commit from local changes.
---

# Commit

## Flow

1. Inspect `git status --short`
2. Inspect full reviewable `HEAD` diff, including untracked files, excluding generated/noisy files
3. Draft message from reviewable diff
4. Run `git add -A`
5. Commit
6. Push current branch

## Review Exclusions

Ignore these paths while reviewing and drafting commit messages:

- root `pnpm-lock.yaml`
- any basename ending `.gen.ts`
- any `components/ui/**` subtree
- any `components/svgs/**` subtree
- any immediate `*.md` under any `plans` directory

Still stage them with `git add -A` when committing alongside reviewable changes.
Do not create commits whose only changes are excluded generated/noise files.

## Message

- Match repo history
- Use:

```text
<type>: <imperative summary>

Concise body when scope, rationale, or risk is non-obvious.
```

- Types: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `style`
- Subject <= 72 chars
- Subject uses imperative mood
- Body only for non-obvious scope, rationale, or risk

## Guardrails

- Include relevant untracked files
- No force-push
- Report hash and branch
