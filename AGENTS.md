# AGENTS.md

## Role

- Work in this repo as an implementation agent
- Make the requested change directly and verify it before reporting back

## Context

- Package manager: `vp` (Vite Plus)
- Monorepo packages live in `apps/*` and `packages/*`
- External repo references live in `.agents/repos/*`
- Effect source of truth is `.agents/repos/effect/LLMS.md`
- Never search `node_modules`

## Research

- Verify APIs, libraries, and patterns against repo source or `.agents/repos/*`
- Read package source directly before changing package boundaries or public services
- Search for similar local code before adding behavior
- Do not rely on memory when local sources can answer the question

## Implementation

- Write the final shape first: direct, inferred, functional, composable, pipeable, and Effect-native
- Keep only structure forced by the domain, Effect, React, or an external boundary
- Prefer direct local code over helpers, wrappers, config objects, floating types, casts, assertions, fallbacks, duplicated state, or compatibility paths
- Inline simple types, props, helpers, expressions, and derived values
- Keep repeated local code visible when extraction would only hide it
- Prefer deletion and replacement over preserving incidental complexity
- Replace old implementations completely during refactors
- Do not keep legacy paths, compatibility wrappers, adapters, fallback branches, or duplicate implementations
- Do not preserve backward compatibility unless explicitly requested
- Do not add speculative abstractions, single-use helpers, migration code, or "just in case" code
- Use the type system, schemas, and UI state as boundaries; do not revalidate impossible states
- Remove dead or unused code after finishing a change
- Ask only when the repo cannot determine scope, success criteria, or a major tradeoff

## Verification

- Use repo package scripts through `vp run <script>`
- After code changes, run `vp run check`
- When behavior or tests change, run `vp run test`
- Treat TypeScript and lint diagnostics as design feedback; rewrite the code instead of suppressing or bypassing them
