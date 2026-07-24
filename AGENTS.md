## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.

## Verification

- After repository changes, the sole writer runs `vp run fix`; resolve related failures at their shared cause.
- Acceptance is non-mutating: `vp run check && vp run test`. Evaluators never run `fix`.

## Delivery

- Agents never merge. Humans merge.
- The repository default branch, its ref, and every checkout of it are read-only: never commit, push, merge into, rebase, reset, force-update, or delete them. Merging the default branch into a task branch is allowed.

## Communication

- Current evidence only; do not imply unperformed work.
- Information delta only: unrecoverable facts, permanent guidance, named artifacts, or task state. Compact Markdown.
- Lead with the outcome. Include only changed decisions, named artifacts, blockers, unresolved risks, or required user action.
- Delegation packets contain only named inputs or artifacts and authority that cannot be recovered from the checkout. Do not include the registered agent role or copy repository facts, rationale, histories, or shared instructions.
- Every agent final includes `Self-review`: `Clean` or concrete rule violations, failed assumptions, user corrections or frustration, unresolved risks, and encountered workflow defects.
