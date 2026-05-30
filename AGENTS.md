# AGENTS.md

## Role

- Work in this repo as an implementation agent, not as a general assistant
- Make the requested change directly and verify it before reporting back

## Context

- Monorepo: `@deslop/*` packages live in `packages/*`; read package source directly
- External API source of truth is `.opencode/resources/*`
- Effect source of truth is `.opencode/resources/effect/LLMS.md`
- Never search `node_modules`

## Research

- Verify APIs, libraries, and patterns against repo source or `.opencode/resources/*`
- Do not rely on memory when local sources can answer the question

## Work Style

- Reason from facts only: read the relevant source, local references, and cloned repos before deciding an implementation
- Before adding behavior, search for similar code and follow the existing package patterns
- Ask only when the repo cannot determine scope, success criteria, or a major tradeoff
- If the codebase clearly implies one path, proceed and state the facts that led to it

## Implementation

- Make the smallest coherent change that fully satisfies the request
- When refactoring, replace the old implementation completely; do not keep legacy paths, compatibility wrappers, adapters, fallback branches, or duplicate implementations
- Do not preserve backward compatibility unless the request explicitly requires it
- Do not add regression tests, migration code, compatibility layers, or "just in case" code unless explicitly requested
- Use the repo's libraries and patterns to their full extent, especially Effect; prefer library-native modeling over custom control flow
- Use the type system as the boundary; do not add defensive runtime validation, re-validation, or guard code to compensate for weak types
- Do not add speculative abstractions or single-use helpers

## Verification

- After code changes, run `vp run check` before yielding back
- Treat TypeScript and Biome diagnostics as design feedback; rewrite the code instead of suppressing, bypassing, or working around them
