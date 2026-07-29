---
name: skill-writing
description: 'Repository instructions, skill metadata and bodies, progressive references, and static-enforcement placement.'
---

Predictability is the goal: independent runs reach the same behavior from the same evidence.

## Ownership

Assign each meaning to one narrow owner:

1. TypeScript: type, inference, control-flow, and module guarantees.
2. Oxlint: maintained generic syntax, import, control-flow, and restriction diagnostics.
3. Effect: maintained type-aware Effect diagnostics and Effect-native replacements.
4. Fallow: repository-graph reachability.
5. Domain skills: semantic engineering behavior that tooling cannot diagnose reliably.

Never enforce one invariant twice. Prefer the earliest maintained owner that proves it without harmful false positives. When a mechanical diagnostic can be satisfied while violating semantic intent, tooling owns the detectable floor and the domain skill retains the decision invariant. Global behavior belongs in `AGENTS.md`; conditional workflow or domain behavior belongs in its skill.

Retain a top-level **Intent** for each domain. Use **Reason / Failure / Direction / Reject** only when the rationale changes how an agent corrects or applies a non-obvious rule.

## Conditional reference

- Writing or restructuring `AGENTS.md`, a skill, metadata, or progressive references: `references/skill.md`.
- Changing TypeScript compiler ownership: `references/typescript.md`.
- Changing the maintained Oxlint inventory: `references/oxlint.md`.
- Changing Effect language-service diagnostics: `references/effect.md`.
- Changing Fallow reachability: `references/fallow.md`.

## Completion

Inspect the complete composed instruction system, including metadata trigger behavior, progressive routes, generated metadata, tooling ownership, and domain intent. Test positive and negative invocation cases. Report only concrete conflicts, duplication, unsupported claims, suppressions, or ambiguity. Return `Self-review: Clean` when none remain.
