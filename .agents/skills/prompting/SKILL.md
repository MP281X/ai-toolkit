---
name: prompting
description: Use when editing SKILL.md files, AGENTS.md files, agent rules, or reusable prompting workflows.
---

# Prompting

## Placement

- Always-valid rule: `AGENTS.md`.
- Domain/task rule: skill.
- Runtime ownership rule: nearest scoped `AGENTS.md`.
- One rule, one surface.
- No duplicated guidance across surfaces.

## Style

- Terse directive bullets.
- Technical nouns over explanation.
- Delete filler, apologies, motivation, encouragement.
- Delete examples unless they prevent ambiguous action.
- Grammar may bend for precision.
- Frontmatter: `name`, `description` only.
- Description triggers loading; body gives operating rules.

## Edits

- Rewrite stale concepts everywhere in same change.
- Delete deprecated variants.
- Keep skills self-contained.
- Split only for distinct trigger.
- Merge when one skill requires reading the other.
