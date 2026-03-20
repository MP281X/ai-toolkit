---
name: self-improve
description: Load when updating agent configuration — biome rules, skills, AGENTS.md, agent workflows.
metadata:
  patterns: |
    packages/linter, .grit, register_diagnostic, biome-ignore lint/plugin,
    SKILL.md, AGENTS.md, .opencode/agents/, .opencode/skills/
---

## Source files

```
packages/linter/src/*.grit
packages/linter/src/-test.tsx
.opencode/skills/*/SKILL.md
.opencode/agents/*.md
AGENTS.md
```

## Core principle

The configuration system is NOT append-only. Every self-improve step MUST leave it the same size or smaller.

- Strengthen an existing line before adding a new one
- Merge overlapping rules before creating a near-duplicate
- Remove lines now covered elsewhere
- Simplify wording until the root cause is obvious

## Triggers

1. Post-task — MANDATORY after validation passes in build and development agents
2. Retry loop — same mistake, new rewrite, still wrong
3. User correction — the user redirects the approach or signals frustration
4. On demand — the user asks to add or update a rule, skill, or guideline

## Priority escalation

1. Biome rule — the pattern is syntactic
2. Biome rule Error message — the rule exists but the fix is unclear
3. Skill — the agent needs the alternative pattern or example
4. AGENTS.md — the mistake reveals a philosophy gap

## Process

1. Review the conversation for repeated errors, user corrections, and retry loops
2. Pick 1-2 highest-impact systemic issues
3. Derive the root cause: what led to this code shape
4. Fix the cheapest layer first
5. Remove redundancy in the other layers
6. Update skill source-file indexes when research found better references

## Biome rule creation

- ALWAYS anonymize tests and examples. Use generic names like `items`, `value`, `result`.
- ALWAYS check existing rules before creating a new one.
- ALWAYS merge overlapping rules.

```grit
engine biome(1.0)
language js(typescript, jsx)

`$pattern` as $match where {
  register_diagnostic(span=$match, message="<fix instruction>. <why>.")
}
```

```typescript
// packages/linter/src/-test.tsx
// biome-ignore lint/plugin: <1-5 word reason>
const bad = codeThatTriggersRule
const good = correctCode
```

Suppression: `// biome-ignore lint/plugin: <1-5 word reason>`

## Cross-layer consistency check

- No duplicated content between AGENTS.md and skills
- No duplicated content between skills
- No contradictions between Biome rules and skill guidance
- Examples follow AGENTS.md rules
