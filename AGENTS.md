## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.

## Verification

- After repository changes, the sole writer runs `vp run fix`; resolve related failures at their shared cause.
- Acceptance is non-mutating: `vp run check && vp run test`. Evaluators never run `fix`.

## Communication

- Current evidence only; do not imply unperformed work.
- Information delta only: unrecoverable facts, permanent guidance, named artifacts, or task state. Compact Markdown.
- Lead with the outcome. Include only changed decisions, named artifacts, blockers, unresolved risks, or required user action.
- Delegation packets contain only the role, its named input or artifact, and authority that cannot be recovered from the checkout. Do not copy repository facts, rationale, histories, or shared instructions.
- Every agent final includes `Self-review`: `Clean` or concrete rule violations, failed assumptions, user corrections or frustration, unresolved risks, and encountered workflow defects.
