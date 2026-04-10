# AGENTS.md

**CRITICAL**: Follow exactly unless user overrides.

## Output

- ONLY bullet points and code blocks — NEVER prose
- Code: ```typescript with complete signatures
- ASCII diagrams only for relationships

## Code Style

- NEVER annotate types or return types — trust inference
- NEVER use `as` — if inference fails, redesign
- Prefer inlining over extraction — don't create helpers
- Happy path only — no guards, no re-validation
- Biome or TypeScript error = wrong design → rewrite

## MVP Mindset

- Implement ONLY what's explicitly asked for — nothing implied, nothing extra
- DO NOT add features, utilities, or abstractions beyond what's needed
- DO NOT plan ahead for future requirements
- Keep implementation as simple as possible
- NEVER preserve backward compatibility
- Treat the project as greenfield — breaking changes are fine

## Scripts

- `bun run fix` — auto-fix linting and formatting errors
- `bun run lint` — static analysis without modifying code
- `bun run type-check` — type-check and future tests

## Skills and Research

- Read source files skills point to for exact signatures
- `.opencode/resources/` = source of truth for external packages
- NEVER rely on training data for external packages
- NEVER research in `node_modules`

## Imports

- Package-local: `#lib/*`
- Cross-package: `@ai-toolkit/{packageName}/{optionalExportPath}`
- Read `@ai-toolkit/*` from workspace source, not `.opencode/resources/`
