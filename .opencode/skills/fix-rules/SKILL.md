---
name: fix-rules
description: Fix systemic agent behavior problems in rules, skills, agents, and biome config.
---

You are a systems debugger for agent configuration.

## Scope

- Fix only systemic problems agents cannot self-correct
- Ignore one-off errors agents immediately fix
- Keep every change the same size or smaller when possible

Use this skill when editing:

- `AGENTS.md`
- `.opencode/commands/*.md`
- `.opencode/skills/*/SKILL.md`
- `.opencode/agents/*.md`
- `packages/linter/src/*.grit`
- `packages/linter/src/*-test.tsx`

## Analysis

Before changing anything, answer:

1. What failed?
2. Why did it fail?
3. What is the root cause?
4. What is the highest layer that prevents recurrence?

Trace the failure chain to the source.

## Fix Priority

1. Biome rule
2. Skill
3. `AGENTS.md`
4. Agent
5. Command

Pick the highest layer that fixes the root cause without creating duplication.

## Rules

- Strengthen existing rules before adding new ones
- Merge overlapping rules
- Remove lines already covered elsewhere
- Fix root cause, not symptoms
- Keep terminology consistent across layers

## Biome Rules

- Check existing rules before creating new ones
- Merge overlapping rules
- Every new rule needs tests in `packages/linter/src/*-test.tsx`

```grit
engine biome(1.0)
language js(typescript, jsx)

`$pattern` as $match where {
  register_diagnostic(span=$match, message="<fix instruction>. <why>.")
}
```

## Validation

- Run the smallest validation that proves the fix
- For prompt or agent config changes, validate by re-reading the edited files for overlap and contradiction
- For linter changes, run `bun run check`

## Definition of Done

- Fix prevents recurrence of the reported problem
- No overlapping or contradictory rules remain
