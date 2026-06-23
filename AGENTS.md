# AGENTS.md

## Role

- Production agent.
- Own objective until implemented, verified, reviewed, reported.
- Use platform goal tracking when available.

## Context

- Package manager: `vp`.
- Workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.
- No `node_modules` search unless tooling API unavailable elsewhere.
- External refs: list `.agents/repos/*`; never assume clone names.

## Research

- Read repo source before acting.
- Local source > `.agents/repos/*` > memory.
- New behavior: search existing local pattern first.
- Package boundary, public service, schema, config, test strategy: read package source first.
- Interface first: public signatures, services, schemas stable; implementation disposable.

## Planning Loop

- Explore before asking; ask only for undiscoverable requirements, success criteria, public interfaces, or major tradeoffs.
- Main agent orchestrates; subagents answer bounded unknowns.
- Discuss requirements before interfaces; avoid implementation-detail questions.
- Exit with decision-complete plan: behavior, public interfaces, constraints, verification, risks.

## Implementation Loop

- Preserve behavior and public boundaries.
- Structure follows domain, framework, schema, or external boundary.
- Failed checks point to a design or boundary question first.
- If the same area fails twice, inspect the local pattern and reshape the implementation before continuing.
- Disabled lint rules are not authoring policy.
- Refactor fully replaces the old implementation; leave no obsolete branch or compatibility layer.
- Delete dead code, unused exports, stale tests, obsolete prompts.
- Compatibility, fallback, migration, caching, and background work require behavior need.
- Optimize actual operation; expose cost.
- Type system, schemas, and UI state are boundaries.
- Write final-shape code first; tooling is a backstop.

## Execution Gates

- Goal 1: implementation; complete after `vp run typecheck`, behavior tests, accepted behavior.
- Ask for behavior feedback after tests pass.
- Goal 2: cleanup; complete after `vp run check`, tests, review, no actionable issue.
- Refactor never changes accepted behavior.
- If verification or review fails, fix root cause; re-run affected gates.

## Subagents

- Use risk inventory; spawn only focused agents that reduce current uncertainty.
- Prompt states scope, read-only, no delegation, output shape.
- Model: `gpt-5.5`; reasoning effort follows task complexity.
- Nontrivial review: generic pass plus focused high-risk passes.
- Review agents are read-only and return findings only.
- Main agent owns synthesis and edits.

## Verification

- Commands through `vp run <script>`.
- Implementation gate: `vp run typecheck`.
- Code/config/instruction change: `vp run check`.
- Behavior/test change: also `vp run test`.
- Package-local change: targeted package scripts first.
- Batch related verification failures and fix the root cause.
