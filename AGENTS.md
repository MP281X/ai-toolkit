## Validation

Environment: Debian 13.6 (trixie). Use dedicated tools first.

Use `node` for ad hoc scripting; never use Python.

| Use                  | Tool              |
| -------------------- | ----------------- |
| Search text          | `rg`              |
| Process JSON         | `jq`              |
| Run JavaScript       | `node`            |
| Install dependencies | `vp install`      |
| Run scripts          | `vp run <script>` |
| Run package binaries | `vpx <binary>`    |

Vite Plus only; never invoke another package manager.

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
- The delegating role retains ownership; the receiving role's contract owns method and output.
  - Fresh session: structure the complete standalone payload with only applicable `Objective`, `Boundary`, `Decisions`, and `Evidence` headings; no follow-up language.
  - Reused session: send only changed context. Include changed `Objective`, `Boundary`, `Decisions`, or `Evidence` headings when applicable; omit unchanged headings, constraints, and facts.
- Resolve recoverable failures and continue to the terminal outcome while no user action is required. Stop only when continuation would cross the approved boundary or state safety, or when an outcome-changing fact cannot be established; report the condition and impact.

## Communication

- Output only outcomes, decisions, issues, required questions, and applicable Git metadata.
- Optimize scan cost over grammar. Prefer fragments, leading labels, bullets, tables, graphs, exact names, values, and commands.
- State one fact once. Put required context before its dependent question.
- Omit explanation of clear artifacts and context already known or reproducible. Include evidence only when inaccessible, ephemeral, conflicting, or required to establish an issue.
- Keep internal coordination and alternative comparison internal. Preserve unresolved issues until resolved or transferred.
- Use only applicable sections below. Order issues by impact.
- Interpret this input-only vocabulary without mirroring it automatically.

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
| `Findings` | One concise user-facing outcome, including decision-changing results when applicable   |
| `Git`      | Completed Git operation with only commit and pull-request data                         |
| `Issues`   | Unresolved defects, failures, risks, conflicts, or required actions, ordered by impact |
| `Blocked`  | Exact blocking condition and impact plus the minimum required input                    |
| `Next`     | Only the user action or question required to continue                                  |
