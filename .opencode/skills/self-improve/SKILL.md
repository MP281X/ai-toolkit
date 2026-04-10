---
name: self-improve
description: Load after validation to fix systemic agent behavior problems. Improves skills, agents, AGENTS.md, biome rules based on observed failures.
metadata:
  patterns: |
    .opencode/skills/, .opencode/commands/ .opencode/agents/, AGENTS.md, packages/linter/
---

## Source files

- `packages/linter/src/*.grit`
- `packages/linter/src/-test.tsx`
- `.opencode/commands/*.md`
- `.opencode/skills/*/SKILL.md`
- `.opencode/agents/*.md`
- `AGENTS.md`

## Trigger

Run after validation in the orchestrator workflow when a failure shows a systemic problem. Skip it for one-off mistakes.

## What to fix

ONLY systemic problems agent can't easily self-correct:

- User contradicts existing rules multiple times (iterations on same issue)
- Agent fails to self-correct after 2-3 attempts on same error
- Pattern repeats AND agent struggles to fix it

IGNORE one-off errors agent immediately fixes.

NEVER modify agents unless user explicitly says there's a problem with them.

## Core principle

NOT append-only. Every change MUST leave system same size or smaller.

- Strengthen existing rule before adding new one
- Merge overlapping rules
- Remove lines now covered elsewhere
- Fix root cause, not symptoms

## Self-reflection

Before any change, analyze deeply:

1. **What failed?** — Exact error pattern, user corrections, retry loops
2. **Why did it fail?** — Missing rule? Ambiguous wording? Contradiction?
3. **Root cause** — Is this a syntax error (biome), pattern error (skill), or philosophy gap (AGENTS.md)?
4. **Optimal fix** — Fix at highest layer that prevents recurrence

NEVER guess. Trace the failure chain to the source.

## Fix priority

Fix at highest layer possible:

1. **Biome rule** — statically enforced, automatic detection (BEST)
2. **Skill** — domain-specific pattern guidance when not statically enforceable
3. **AGENTS.md** — cross-cutting philosophy when not domain-specific
4. **Agent** — ONLY when user explicitly reports problem with agent workflow

## Biome rules

- Check existing rules before creating new
- Merge overlapping rules
- EVERY rule MUST have tests in `-test.tsx`
- Anonymize skill examples: use `items`, `value`, `result` (no `users`, `customers`, etc.)

```grit
engine biome(1.0)
language js(typescript, jsx)

`$pattern` as $match where {
  register_diagnostic(span=$match, message="<fix instruction>. <why>.")
}
```

### Tests

```typescript
// packages/linter/src/-test.tsx
// biome-ignore lint/plugin: <reason>
const bad = codeThatTriggersRule
const good = correctCode
```

Suppression: `// biome-ignore lint/plugin: <1-5 word reason>`

## Validation

After making a systemic fix:

1. Run the project's normal autofix, lint, and type-check workflow
2. Fix any failures
3. Repeat until everything passes
4. Ensure the new rule or prompt change actually prevents recurrence
