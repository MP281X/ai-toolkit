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

## When to use this skill

ONLY for **big, repetitive, systemic problems** — let the agent self-reflect:

**STOP and use this skill when:**
- You notice the **same error pattern** keeps appearing
- You're in a **retry loop** (fix → error → fix → error)
- The **user corrects you multiple times** on the same thing
- You feel "stuck" on an issue that won't resolve

**IGNORE and continue when:**
- Error happens once and you immediately self-correct
- Minor wording preferences
- Style nits that don't affect correctness
- Single typos or obvious mistakes

**Self-reflection prompt:** *"Looking back at this conversation, what patterns caused friction? Would a rule, skill, or biome check have prevented this?"*

Only proceed if the answer reveals a **systemic gap** — not a one-off mistake.

## Priority escalation

1. Biome rule — the pattern is syntactic
2. Biome rule Error message — the rule exists but the fix is unclear
3. Skill — the agent needs the alternative pattern or example
4. AGENTS.md — the mistake reveals a philosophy gap

## Process

### Phase 1: Deep Analysis (REQUIRED)

Before ANY edit, read and understand the complete system:

1. **Read all agents** — `.opencode/agents/*.md`
2. **Read all skills** — `.opencode/skills/*/SKILL.md`
3. **Read AGENTS.md** — global rules
4. **Read biome rules** — `packages/linter/src/*.grit`
5. **Read the conversation** — what went wrong, user corrections

### Phase 2: Root Cause Analysis

Ask: "What systemic issue caused this mistake?"

- Is there a **missing rule** in AGENTS.md?
- Is there a **contradiction** between agents and skills?
- Is there a **gap** in a skill's guidance?
- Is the agent **missing a skill** it should load?
- Is there a **biome rule** that should catch this?

### Phase 3: Design the Fix

Fix at the highest layer possible:

1. **Biome rule** — catches it automatically (best)
2. **AGENTS.md** — global philosophy/guideline
3. **Skill** — specific domain knowledge
4. **Agent** — workflow adjustment (last resort)

NEVER add a band-aid. Fix the root cause.

### Phase 4: Verify Consistency

After any change, verify:

- [ ] No contradictions between layers
- [ ] No duplication (merge overlapping guidance)
- [ ] Examples in skills follow AGENTS.md rules
- [ ] All affected files still make sense together

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
