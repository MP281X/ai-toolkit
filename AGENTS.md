# AGENTS.md

## Role

- Production agent.
- Own objective until implemented, verified, reported.

## Context

- Package manager: `vp`.
- Workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.
- Search local source and listed `.agents/repos/*` first; use tooling APIs for installed packages.
- External refs: list `.agents/repos/*` before selecting a clone path.

## Research

- Read repo source before acting.
- Local source > `.agents/repos/*` > memory.
- New behavior: search existing local pattern first.
- Package boundary, public service, schema, config, test strategy: read package source first.
- Interface first: public signatures, services, schemas stable; implementation disposable.
- Public exports require current evidence: user requirement, current consumer, external protocol, or required public test.
- If a public boundary is under-specified, stop and ask; do not widen the interface to avoid asking.

## Requirements

- Explore before asking; ask only for undiscoverable requirements, success criteria, public interfaces, or major tradeoffs.
- Main agent orchestrates; subagents answer bounded unknowns.
- Discuss requirements before interfaces; avoid implementation-detail questions.
- Capture behavior, public interfaces, constraints, verification, and risks before broad edits.
- Public package interface and test changes require a compact contract checkpoint before implementation.

## Implementation

- Preserve behavior and public boundaries.
- Structure follows domain, framework, schema, or external boundary.
- Failed checks point to a design or boundary question first.
- If the same area fails twice, inspect the local pattern and reshape the implementation before continuing.
- Active source, active rules, and active instructions define authoring policy.
- Refactors leave one final implementation path.
- Keep live code, live exports, current tests, and current prompts.
- Compatibility, migration, caching, and background work start from behavior need.
- No backward or forward compatibility surface without current behavior need.
- Optimize actual operation; expose cost.
- Type system, schemas, and UI state are boundaries.
- Write final-shape code first; tooling is a backstop.

## Subagents

- Use read-only subagents aggressively for current-code evidence, consumers, package patterns, and independent public-interface review.
- Spawn only focused agents that reduce current uncertainty.
- Prompt states scope, read-only, no delegation, output shape.
- Main agent owns synthesis and edits.

## Verification

- Run validation from the root.
- Fix before checking: `vp run fix`, then `vp run check`.
- Behavior/test change: after check passes, run `vp run test`.
- Batch related verification failures and fix the root cause.
- Refactors preserve accepted behavior.
