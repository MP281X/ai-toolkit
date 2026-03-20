# AGENTS.md

Global rules for all agents.

## Skills

- Skills often have enough context to proceed without research
- Read the source files the skill points to for exact signatures and helpers
- `.opencode/resources/` is the last resort

## Research

Research is lazy and demand-driven — not a precondition to start working.

- `.opencode/resources/` is the source of truth for external packages
- NEVER rely on training data for external packages — critical for Effect
- NEVER research in `node_modules`
- Prefer small, parallel, targeted questions (e.g. "what is the signature of X", "what methods does Y have") over broad exploration
- Multiple small explore agents in parallel >> one big explore agent
- Read source files deeply enough to confirm signatures and patterns before implementing
- Compare available patterns and choose the simplest, most idiomatic one

## Code Style

- USE Effect modules as the standard library. `Array`, `String`, `Record`, `Option`, `Predicate`, `Match`, `pipe`, and `flow` are the ONLY data-transform vocabulary.
- NEVER use native prototype methods (`.map()`, `.filter()`, `.trim()`, `.split()`, `.includes()`, etc.)
- NEVER use `typeof`. Use `Predicate.*`.
- NEVER use nullish checks (`== null`, `!== null`, `=== undefined`). Use `Predicate.*` or `Option`.
- Compose with `pipe` and `flow`, not intermediate variables.
- NEVER annotate variable types or return types. If inference fails, redesign.
- NEVER use `as` assertions.
- Trust the type system. Happy path only.
- Boundary validation is complete. NEVER add internal guards or re-validation for typed values.
- Ignore unreachable edge cases.
- NEVER extract property accesses, aliases, boolean checks, simple functions, wrapper functions, or primitive constants.
- Inline when the helper has no real logic.
- Only extract when the helper contains real logic and makes the code simpler after extraction.
- Prefer small local duplication over meaningless extraction.
- Keep interfaces minimal — expose only what consumers need.
- NEVER use `else`. Use early returns or `Match`.
- NEVER destructure function parameters. Access `props.x` so the data source stays visible.
- Keep control flow flat.
- Biome or TypeScript error means the design is wrong. Simplify and rewrite.
- NEVER fight the type system or the biome rules. Rewrite until the direct code typechecks.

## Package Imports

Use package-local subpath imports inside a package, for example `#lib/*`.
Use cross-package imports in the form `@ai-toolkit/{packageName}/{optionalExportPath}` instead of reaching into another package's source files directly.

`@ai-toolkit/*` packages live in the workspace — read the local source, not `.opencode/resources/`.

## Validation

Run these commands after every implementation:

1. `bun run fix` — fix auto-correctable issues  
2. `bun run check` — run type checks and linting
