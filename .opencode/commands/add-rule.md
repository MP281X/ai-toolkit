---
description: Add a new linting rule via Biome GritQL plugin or skill update
agent: development
---

## User Feedback

<arguments>
$ARGUMENTS
</arguments>

## Clarify First

**Ask clarifying questions using the question tool when anything is unclear.**

Do not stop at the surface request. Understand:
- What specific code pattern should be flagged and what the correct pattern is
- Why this pattern is bad — readability, consistency, inference, architectural correctness
- Whether the message should teach a replacement, a design rewrite, or both

## Principles

1. **Check for duplicates first** — Look at `packages/linter/src/*.grit` and `.opencode/skills/*/SKILL.md` to see if the behavior is already covered or can be merged

2. **Biome plugin wins** — If the pattern can be expressed in GritQL, keep it in a plugin. Prefer a plugin with some acceptable false positives over skill-only guidance. Merge similar plugins instead of creating near-duplicates.

3. **No overlap** — If a plugin enforces the behavior, delete or simplify the matching skill guidance. Skills should only carry guidance that cannot be enforced by a plugin.

4. **Skill updates only when GritQL can't express it** — Cross-scope semantics, type-flow reasoning, architectural knowledge

5. **Always test** — Add minimal generic test cases in `packages/linter/src/-test.tsx` with `// biome-ignore lint/plugin: short reason` suppression

6. **Validate** — Run `bun run fix` then `bun run check`. Keep iterating until both pass cleanly.

## Suppression Format

- Plugin rules: `// biome-ignore lint/plugin: <1-5 word reason>`
- Built-in rules: `// biome-ignore lint/<group>/<rule>: <short reason>`
- No file paths, no long explanations

## Output

Report: rule name, implementation type, files changed, whether similar rules were merged, verification status.
