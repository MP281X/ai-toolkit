# AGENTS.md

**CRITICAL**: Every instruction here is **MISSION CRITICAL**. YOU MUST follow exactly. **ONLY** exception: user explicitly overrides.

## Output Format

- ONLY bullet points and code blocks
- NEVER paragraphs or prose
- NEVER repeat the user's request
- Code: ```typescript with complete signatures
- ASCII diagrams only when clarifying relationships

## Validation

After every implementation:

1. `bun run fix` — fix auto-correctable issues
2. `bun run check` — type checks and linting
3. If either fails: fix errors, repeat 1-2
4. Only proceed when BOTH pass

## Code Style

### Type Inference

- NEVER annotate variable types or return types
- NEVER use `as` type assertions
- If inference fails: design is wrong, redesign
- NEVER fight the type system

### Inline Everything

- NEVER create functions/helpers/components/modules unless user EXPLICITLY asks
- Inline ALL logic at use site
- Duplicate freely — duplication cheaper than wrong abstraction
- DON'T extract functions — requires typed arguments, breaks inference
- DON'T share functions across call sites — get modified, break existing code

### General

- Read existing implementations for patterns
- Trust type system — happy path ONLY, no guards, no re-validation
- Flat control flow, minimal interfaces
- Biome/TypeScript error = wrong design. Rewrite

## Skills

- Assume skills have enough context to proceed without research
- Read source files skills point to for exact signatures
- Use `.opencode/resources/` only as last resort

## Research

Research is lazy and demand-driven — not precondition.

- `.opencode/resources/` is source of truth for external packages
- NEVER rely on training data for external packages
- NEVER research in `node_modules`
- Prefer small, parallel, targeted questions over broad exploration
- Read source files deeply enough to confirm signatures before implementing
- Choose simplest, most idiomatic pattern

## Package Imports

- Use package-local subpath imports: `#lib/*`
- Use cross-package imports: `@ai-toolkit/{packageName}/{optionalExportPath}`
- Read `@ai-toolkit/*` packages from workspace source, not `.opencode/resources/`
