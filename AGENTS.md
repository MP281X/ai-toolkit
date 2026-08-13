## Repository

- Workspace: use `vp`; members live under `apps/*` and `packages/*`.
- Runtime: Effect owns behavior and state; servers are authoritative; streaming RPC synchronizes Atom; React presents; adapters translate external interfaces.

## Vocabulary

| Term               | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Contract           | Requested current behavior from the task or canonical issue                                                 |
| Owner              | Sole abstraction responsible for a behavior, state, fact, or lifecycle                                      |
| Coupled path       | Dataflow, lifecycle, configuration, and proof directly required by the owner                                |
| Boundary           | Point where unknown external data is decoded once                                                           |
| Typed value        | Internal value guaranteed by its type or boundary schema                                                    |
| Reachable failure  | Typed failure permitted by the contract                                                                     |
| Semantic duplicate | Repeated meaning, responsibility, behavior, or representation regardless of syntax or name                  |
| Construction       | Smallest explicit sole implementation completing the contract                                               |
| Instructions       | Mandatory constraints from this file plus every invoked skill and loaded reference                          |
| Enforcement        | TypeScript, Oxlint, Oxfmt, effect-tsgo, React Compiler/Doctor, Fallow, and custom static rules              |
| Base               | Explicit comparison ref: preceding stack branch, actual pull-request base, or fetched remote default branch |
| Candidate          | Every commit after the base plus staged, unstaged, deleted, renamed, generated, and untracked files         |

## Change

- Implement the contract at its owner with the construction.
- Resolve missing material behavior from an authority; ask when none exists. Never invent domain values, defaults, compatibility, or policy.
- Trust typed values; validate only boundaries; omit states excluded by types or schemas.
- Propagate the first reachable failure; retry or recover only when required by the contract.
- Treat enforcement diagnostics as evidence of their earliest shared cause; correct the owner, not symptoms.
- Complete the owner and coupled path; remove dead, superseded, duplicate, or contract-obsolete branches, props, schema fields, state, types, exports, dependencies, wrappers, and empty directories; internal compatibility does not preserve them.
- Preserve unrelated behavior and user changes.

## Authorization

- The primary never edits repository content; authorized Git or GitHub mutations remain owned by `git-operations`.
- Every Git or GitHub mutation requires an explicit request for that exact operation; other requests never imply authority.
- Never commit, push, create or switch branches, create or edit issues or pull requests, merge, reset, discard, delete, or rewrite Git state without that request.
- Ready and merge remain user-owned.

## Delegation

- Skills named `delegate-*` execute only inside clean subagents. The primary routes matching work from catalog metadata without reading the skill body or performing the delegated work.
- Parallelize independent work. Keep one active repository writer.
- Full-history forks inherit model and effort.

## User-visible writing

- Audience: expert software developer.
- Output: declarative required current state; retain only the authoritative delta since the previous user-visible response.
- Keep: new decisions, corrections, blockers, findings, and requested artifacts.
- Remove: introductions, recaps, conclusions, process, tool or subagent activity, implicit steps or success, validation success, restated input, unchanged state, discarded alternatives, filler, tutorials, rhetoric, and visual narration.
- Structure: deduplicate semantics; group and order by owner and user impact; state each fact once in one representation.
- Representation: choose the most readable compact GFM form. Prefer actual code, diff, table, Mermaid, or list over prose; use one clear line when visual structure adds no value. Never use `text` code fences as prose or repeat a visual in prose.
- Questions: place each question beside the decision that creates it; never collect detached questions at the end.
- Language: technical, direct, unambiguous.
