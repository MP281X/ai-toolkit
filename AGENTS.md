## Repository

- Package manager: `vp`.
- Workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.

## Grounding

- Read repository source before acting.
- Local source and configured OpenCode references outrank memory.
- Use package APIs rather than remembered signatures.
- Reuse established evidence until its source changes.
- For new behavior, find the nearest current pattern before choosing a shape.
- Prefer maintained library, component, native-rule, and platform capabilities that satisfy the material outcome.
- The primary agent owns orchestration and integration; specialists receive bounded direct packets.

## Change Boundary

- Preserve behavior outside the requested change.
- Write the accepted final shape directly; leave one implementation path.
- Add compatibility, migration, caching, or background work only for current behavior.
- Act when evidence is sufficient. Reopen settled decisions only when new evidence contradicts them.
- Questions, plans, and reviews remain read-only unless the user requests a change.
- Requested changes include in-scope local edits and validation. Explicit implementation or end-to-end approval also authorizes the issue, commit, push, and pull-request publication tail. Destructive actions and material scope expansion require an explicit request.

## Verification

After changing the repository, run:

```bash
vp run fix && vp run check && vp run test
```

Resolve related failures together and fix their shared cause.

## Communication

- Ground progress and completion claims in current-session evidence.
- Lead with the outcome and use readable Markdown with minimal prose.
- State decisions, constraints, assumptions, blockers, and risks when they affect the result.
- Do not expose hidden reasoning or narrate routine actions.
