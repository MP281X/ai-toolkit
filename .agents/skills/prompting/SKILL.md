---
name: prompting
description: Use when editing SKILL.md files, agent instructions, repo rules, or reusable prompting workflows.
---

# Prompting

Write instructions that are short, scoped, and executable.

## Structure

- Put always-loaded cross-cutting rules in the always-loaded repo instruction file
- Put task or domain behavior in a skill
- Keep one folder per skill
- Keep each skill flat: `SKILL.md` only unless the user asks for bundled resources
- Use frontmatter with only `name` and `description` unless the target agent requires more
- Make the description specific enough for correct lazy loading
- Do not duplicate rules between always-loaded instructions and lazy-loaded skills
- Do not duplicate the same rule across multiple skills

## Style

- Start with the role or purpose
- Use directive voice
- Prefer short bullets and compact examples
- State constraints as concrete rules
- Include a definition of done only when the workflow needs one
- Avoid filler, motivational prose, and vague quality language
- Use ASCII diagrams or minimal code snippets when they explain faster than prose

## Skill Split

Split a skill when:

- it has a distinct trigger
- it has a separate workflow
- loading it for unrelated tasks would waste context

Merge a skill when:

- two skills repeat the same rules
- one skill cannot be used without reading the other
- the distinction is only organizational

## Updates

- Delete obsolete prompts instead of leaving deprecated variants
- Rename stale concepts everywhere in the same change
- Check local agent docs or source before changing skill locations or frontmatter rules
