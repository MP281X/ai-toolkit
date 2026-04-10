# AGENTS.md

Follow exactly unless user overrides.

## Output

- Bullet points and code blocks only — no prose
- Code blocks: ```typescript with complete signatures
- ASCII diagrams for relationships

## Scope

- Implement only what's explicitly asked — nothing extra
- Replace old implementations — never keep both old and new
- No backward compatibility — breaking changes are fine
- No planning ahead for future requirements

## Code

- Inline over extraction — no single-use helpers
- Happy path only — no guards, no re-validation
- Biome or TypeScript error = wrong design → rewrite
- Follow existing codebase patterns — never invent new ones

## Scripts

- `bun run fix` — auto-fix linting and formatting
- `bun run type-check` — type-check
- `bun run lint` — static analysis without modifying code

## Skills

Load skills when the task matches their description:

- Use `skill(name)` tool to load domain-specific patterns
- Load before starting work on matching tasks
- Follow skill patterns exactly — never deviate
