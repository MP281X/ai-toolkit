---
name: prompting
description: Rules for editing AGENTS.md, .opencode/commands/, .opencode/skills/, and .opencode/agents/ files.
---

## References

- https://developers.openai.com/api/docs/guides/prompt-guidance
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/skills/

## Architecture

AGENTS.md, skills, agents, and commands form a layered system. No duplication across layers.

- **AGENTS.md** — always loaded. Cross-cutting rules for every agent.
- **Skills** — lazy-loaded via tool. Domain-specific patterns and conventions.
- **Agents** — subagent definitions. Role, workflow, constraints for a specific execution mode.
- **Commands** — user-invoked templates. Inject context, reference an agent, run as subtask.

## Structure

- Role anchor first — one sentence, second person: "You are X."
- Then impersonal directives for all rules
- XML tags to separate data from instructions — `<request>`, `<context>`, `<changed_files>`
- Data at top, instructions below — models process context better this way
- Flat hierarchy — no nested bullets
- Numbered lists for ordered steps, bullets for unordered constraints

## Language

- Directive voice: "Do X" — not "Try to X", "You should X", "Consider doing X"
- State what to do, not what to avoid: "Write prose" over "Don't use bullets"
- Inline rationale when WHY isn't obvious: "Use XML tags — prevents model confusing instructions with data"
- No filler: drop "please", "make sure to", "it's important that", "note that"
- No aggressive markers: drop "CRITICAL", "YOU MUST", "EXTREMELY IMPORTANT" — normal language works
- Hard constraints: "Never X" — not "Avoid X when possible"
- Consistent terminology across all files

## Completeness

Every prompt defines three things:

1. **Role** — what the agent is (1-2 sentences)
2. **Constraints** — hard rules that limit behavior
3. **Definition of done** — what "finished" looks like

## Examples

Good/bad pairs when behavior is ambiguous. Show structure, not content.

```text
// Bad — vague, passive, filler
You should try to make sure that the code is clean and follows best practices when possible.

// Good — directive, specific, constrained
Inline single-use helpers. Match existing naming conventions. Never add new abstractions.
```

```text
// Bad — nested, verbose
## Rules
- When writing code:
  - Make sure to:
    - Follow patterns
    - Check types
    - Run linting

// Good — flat, direct
## Rules
- Follow existing codebase patterns
- Type-check must pass before returning
- Run `bun run type-check` after changes
```

## OpenCode specifics

### Commands (.opencode/commands/*.md)

Frontmatter: `description` (required), `agent` (optional), `subtask` (optional), `model` (optional)

- `$ARGUMENTS` — user input, wrap in `<request>` XML block
- `` !`command` `` — inject shell output into prompt
- `@file` — inject file content into prompt

### Skills (.opencode/skills/*/SKILL.md)

Frontmatter: `name` (required), `description` (required)

- Domain-specific rules and conventions
- Good/bad examples for ambiguous patterns

### Agents (.opencode/agents/*.md)

Frontmatter: `description` (required), `mode` (required), `model` (optional), `permission` (optional)

- Brief role anchor
- Ordered workflow steps
- Hard constraints
- Definition of done

### AGENTS.md

- Cross-cutting rules only — applies to every agent
- No domain-specific patterns (those go in skills)
- No task-specific instructions (those go in commands)
