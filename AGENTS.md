# AGENTS.md

Global rules for all agents.

## Skills

Skills provide guidelines, best practices, and a minimal file index for external libraries.

- Load the relevant skill when about to work with that library or pattern
- The skill often has enough context to proceed without further research
- When you need specifics (exact signatures, helpers), read the source files the skill points to
- Broad exploration of `.opencode/resources/` is a last resort when the indexed files don't have what you need

## Research

Research is lazy and demand-driven — not a precondition to start working.

- `.opencode/resources/` is the source of truth for external packages
- Never rely on training data for external packages — critical for Effect v4
- Never research in `node_modules`
- Prefer small, parallel, targeted questions (e.g. "what is the signature of X", "what methods does Y have") over broad exploration
- Multiple small explore agents in parallel >> one big explore agent
- Read source files deeply enough to confirm signatures and patterns before implementing
- Compare available patterns and choose the simplest, most idiomatic one

## Code Quality

- If the code is hard to type correctly, the design is probably wrong.
- Inline and flatten — don't extract property accesses, primitive values, or simple checks into variables
- Compose transformations in pipelines instead of step-by-step intermediate variables
- Do not add wrappers, transient containers, or extra validation checks just to make code typecheck
- Prefer small local duplication over meaningless helper extraction
- Trust the type system — external data is validated by Effect RPC, internal data by types
- Implement the happy path only; don't add defensive checks for hypothetical failures
- Keep interfaces minimal — expose only what consumers need, no unnecessary fields or options
- Never annotate types on variables or return types, never use `as` assertions — if inference doesn't work, the design is wrong
- Keep control flow flat — no `else`, use early returns and `Match` for value-producing branches

- If a Biome or TypeScript error fires, treat it as evidence that the current design is wrong, not as a prompt to add annotations, casts, wrappers, or local workarounds
- The goal of the biome rules and skills is to force simpler, more direct, more inferable code and block AI slop
- If you feel tempted to fight the type system or the biome rules, step back and rewrite the code in a simpler shape

## Package Imports

Use package-local subpath imports inside a package, for example `#lib/*`.
Use cross-package imports in the form `@ai-toolkit/{packageName}/{optionalExportPath}` instead of reaching into another package's source files directly.

`@ai-toolkit/*` packages live in the workspace — read the local source, not `.opencode/resources/`.

## Progress Tracking

Use the todo tool to track progress on multi-step tasks.

- Break work into specific, actionable items
- Update status as you go — mark tasks complete immediately after finishing
- Keep one task in progress at a time

## Validation

Run these commands after every implementation:

1. `bun run fix` — fix auto-correctable issues  
2. `bun run check` — run type checks and linting
