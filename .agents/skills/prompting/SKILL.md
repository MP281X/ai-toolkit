---
name: prompting
description: Use when editing SKILL.md files, agent instructions, repo rules, or reusable prompting workflows.
---

# Prompting

## Structure

- Cross-cutting rule: always-loaded instructions
- Task/domain rule: skill
- Skill shape: one folder, one `SKILL.md`
- Frontmatter: `name`, `description` only unless target agent requires more
- Description: lazy-loading trigger, not summary fluff
- One rule, one surface

## Style

- Start with purpose or constraint
- Directive voice
- Technical terms, short bullets, compact examples
- Completion criteria only when behavior changes without them
- Delete filler, motivation, vague quality words, repeated facts

## Skill Split

Split a skill when:

- distinct trigger
- separate workflow
- unrelated loading wastes context

Merge a skill when:

- repeated rules
- one requires reading the other
- split is only organizational

## Updates

- Delete obsolete prompts; no deprecated variants
- Rename stale concepts everywhere in the same change
- Check local agent docs or source before changing skill locations or frontmatter rules
