# AGENTS.md

Global rules for all agents.

## Research Required

Always search `.opencode/resources/{reponame}/` before implementing.

- `.opencode/resources/` is the **only** source of truth for external packages
- Never rely on training data
- Never research in `node_modules`
- Use explore agent for parallel research across packages
- Critical for Effect v4: your training data only covers v3
- Do not stop at file discovery — read the relevant source modules deeply enough to confirm signatures, helpers, and examples before implementing
- Do not stop at the first API that can work — libraries like Effect often have multiple valid options, so compare the available patterns and choose the simplest and most idiomatic one for the current code

## Simplification Required

If the code is hard to type correctly, the design is probably wrong.

- Inline and flatten before adding helpers
- Do not add wrappers, transient containers, or extra validation checks just to make code typecheck 
- Prefer small local duplication over meaningless helper extraction
- Trust the type system — external data is validated by Effect RPC, internal data by types
- Implement the happy path only; don't add defensive checks for hypothetical failures
- If a Biome or TypeScript error fires, treat it as evidence that the current design is wrong, not as a prompt to add annotations, casts, wrappers, or local workarounds
- The goal of the biome rules and skills is to force simpler, more direct, more inferable code and block AI slop
- If you feel tempted to fight the type system or the biome rules, step back and rewrite the code in a simpler shape

## Package Imports

Use package-local subpath imports inside a package, for example `#lib/*`.
Use cross-package imports in the form `@ai-toolkit/{packageName}/{optionalExportPath}` instead of reaching into another package's source files directly.

## Validation

Run these commands after every implementation:

1. `bun run fix` — fix auto-correctable issues  
2. `bun run check` — run type checks and linting
