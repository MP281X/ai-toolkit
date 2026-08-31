## Validation

This is a Vite Plus monorepo backed by Node.js and pnpm; use `vp` and `vpx`, never pnpm directly.

| Changed files                 | Exact command                               |
| ----------------------------- | ------------------------------------------- |
| Only Markdown files changed   | `vp run fix`                                |
| Any non-Markdown file changed | `vp run fix && vp run check && vp run test` |

For these validation commands, use no flags, paths, partials, underlying tools, builds, or substitutes.

## Product scope

- Target Linux and the user's personal-software workflow only.
- Select the smallest root fix. Challenge excess scope; do not add configurability, extensibility, onboarding, or hypothetical support.
- Releases are linear and squash-merged. Apply data changes at every merged pull request.
- Local data is disposable. Preserve production data only from the immediately previous release; delete obsolete data.
- Persist only irreducible canonical data and infer the rest. Remove superseded paths and adapters; preserve compatibility only when explicitly required.

## Behavior

- The user-approved objective and mutation boundary are the authority for all work. Mutate only assigned state and preserve all other state.
- Ground factual, causal, mechanism, dependency, and platform claims in current source or configured read-only authoritative references; re-derive them as the work changes and follow every loaded instruction, skill, and reference.
- Delegation retains ownership with the delegating role. Pass only the objective, boundary, decisions, and inaccessible evidence; the receiving role's contract owns method and output.
- Continue after recoverable failures. Stop only when continuation would violate the approved boundary or state safety, and report the condition and impact.
- Do not invent information, decisions, evidence, or completion that could change the outcome. Report a real blocker when required facts cannot be established safely.

## Communication

- Default to a compact result, decision, blocker, or required question; lead with it and explain only when requested or needed for a decision.
- Assume repository fluency and read relevant sources top to bottom before reporting.
- Keep internal coordination and alternative comparison internal. Report only unresolved or preventable failures, stating each fact once in the smallest clear GFM structure.
- Include evidence only when it is inaccessible, ephemeral, conflicting, or needed to establish an issue.
- Preserve unresolved issues until resolved or transferred.
- Use only applicable sections from the table below. Order issues by impact.
- Treat the following as input-only user vocabulary. Use these meanings to interpret user input; do not mirror the words automatically.

| Word         | Explanation                                                            |
| ------------ | ---------------------------------------------------------------------- |
| `Workflow`   | The reusable process that governs how agents complete work             |
| `Aggressive` | Thoroughly pursue the approved outcome without expanding its scope     |
| `Deep pass`  | Inspect the complete approved scope, dependencies, and counterexamples |
| `Checkpoint` | Record completed work in Git after required implementation and proof   |
| `Centralize` | Give one responsible component ownership of shared policy              |
| `Slop`       | Unnecessary, vague, repetitive, generic, or low-value content          |

| Section    | Meaning                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `Findings` | Decision-changing results                                                              |
| `Git`      | Completed Git operation with only commit and pull-request data                         |
| `Issues`   | Unresolved defects, failures, risks, conflicts, or required actions, ordered by impact |
| `Blocked`  | Exact blocking condition and impact plus the minimum required input                    |
| `Next`     | Only the user action or question required to continue                                  |
