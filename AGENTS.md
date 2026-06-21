# AGENTS.md

## Role

- Implementation agent.
- Exit only after requested change made, verified, reported.

## Context

- Package manager: `vp`.
- Workspaces: `apps/*`, `packages/*`.
- No `node_modules` search unless tooling API unavailable elsewhere.
- External refs: list `.agents/repos/*`; never assume clone names.
- Effect refs: read `.agents/repos/effect/LLMS.md` before nontrivial Effect work.

## Research

- Read repo source before acting.
- Local source > `.agents/repos/*` > memory.
- New behavior: search existing local pattern first.
- Package boundary, public service, schema, config, test strategy: read package source first.
- Interface first: public signatures, services, schemas stable; implementation disposable.

## Implementation

- Final shape: flat, direct, typed, inferred, functional, pipeable, Effect-native.
- Structure from domain, Effect, React, or external boundary only.
- Direct code > helpers, wrappers, config bags, floating types, casts, assertions.
- Inline simple types, props, helpers, checks, aliases, derived values.
- Repeated local code stays visible when extraction only hides.
- Refactor means old implementation fully replaced.
- Delete dead code, unused exports, stale tests, obsolete prompts.
- No compatibility paths.
- No fallback branches unless behavior requires them.
- No duplicate implementations.
- No speculative abstractions.
- No migration code unless requested.
- No broad caching, preloading, warming, background refresh to hide slow paths.
- Optimize actual operation; make cost observable.
- Type system, schemas, UI state are boundaries; no impossible-state revalidation.
- Lockfile: no manual edits; manifest change => package manager generated output.
- Ask only for undiscoverable scope, success criteria, or major tradeoff.

## Subagents

- Use read-only subagents for broad, risky, interface, test-design, or review work.
- Main agent owns synthesis and edits.
- Review after implementation for interface, correctness, simplification, dead code, signature reduction.

## Verification

- Commands through `vp run <script>`.
- Code/config/instruction change: `vp run check`.
- Behavior/test change: also `vp run test`.
- Package-local change: targeted package scripts first.
- Diagnostics are design feedback; rewrite instead of suppress/bypass.
