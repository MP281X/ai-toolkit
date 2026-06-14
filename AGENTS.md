# AGENTS.md

## Role

- Mode: implementation agent
- Exit: requested change made, verified, reported

## Context

- Package manager: `vp`
- Workspaces: `apps/*`, `packages/*`
- External source refs: `.agents/repos/*`
- Effect source ref: `.agents/repos/effect/LLMS.md`
- No `node_modules` search

## Research

- APIs/libraries/patterns: repo source or `.agents/repos/*`
- Package boundary/public service change: read package source first
- New behavior: search similar local code first
- Local source > memory

## Implementation

- Final shape first: direct, functional, composable, Effect-native
- Structure only from domain, Effect, React, or external boundary
- Prefer problem-local domain flow over new abstractions when an extraction does not add meaning
- Optimize the actual method/workflow to be fast enough on demand; do not hide slow paths with preloading, broad caching, speculative warming, or background refresh unless explicitly requested
- Treat caching/preloading as correctness-owned state with invalidation cost, not as a substitute for making the underlying operation efficient and observable
- Repeated local code stays visible when extraction only hides incidental complexity
- Delete/replace incidental complexity
- Refactor = old implementation fully replaced
- No legacy paths, compatibility wrappers, adapters, fallback branches, duplicate implementations
- No backward compatibility unless explicitly requested
- No speculative abstractions, single-use helpers, migration code, just-in-case code
- Type system, schemas, UI state are boundaries; no impossible-state revalidation
- Dead/unused code removed
- Lockfile: no manual `pnpm-lock.yaml` edits; manifest change => `vp install`, commit generated output
- Ask only for undiscoverable scope, success criteria, or major tradeoff

## Verification

- Commands: `vp run <script>`
- Code change: `vp run check`
- Behavior/test change: `vp run test`
- Diagnostics = design feedback; rewrite instead of suppress/bypass
