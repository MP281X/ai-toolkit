## Repository

- Workspace: use `vp`; members live under `apps/*` and `packages/*`.

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

- Implement the contract at its owner with the construction; complete its coupled path.
- Resolve missing authority; never invent domain values, defaults, compatibility, or policy.
- Treat enforcement diagnostics as evidence of their earliest shared cause.
- Preserve unrelated behavior and user changes.

## Delegation

- Skills named `delegate-*` execute only inside subagents; the primary routes from catalog metadata without reading their bodies. Invoke `git-operations` before every Git or GitHub interaction, including reads and message drafting.

| Work                                                          | Agent                                | Context                    | Model · effort           | Mutation                  |
| ------------------------------------------------------------- | ------------------------------------ | -------------------------- | ------------------------ | ------------------------- |
| Exact one-command lookup                                      | Primary                              | Current                    | Inherited                | None                      |
| Unclear or multi-command exploration                          | `delegate-exploration`               | Clean                      | `gpt-5.6-terra` · medium | None                      |
| Disputed or multi-source synthesis                            | Parallel `delegate-exploration`      | Clean · independent        | `gpt-5.6-sol` · high     | None                      |
| Repository implementation                                     | Persistent `delegate-implementation` | Clean · objective → deltas | Inherited                | Sole writer               |
| Independent assurance                                         | `delegate-assurance`                 | Clean · one primary lens   | `gpt-5.6-sol` · xhigh    | None                      |
| Explicit Git or GitHub mutation                               | Default                              | Full history               | Inherited                | Exact requested operation |
| Authorized token-heavy external action requiring conversation | Default                              | Full history               | Inherited                | Authorized external state |

- Clean: `fork_turns: "none"`. Full history: inherit model and effort.
- Parallelize independent work. Keep one active repository writer.

## User-visible writing

- Audience: expert software developer.
- Output: declarative required current state; retain only the authoritative delta since the previous user-visible response.
- Keep: new decisions, corrections, blockers, findings, and requested artifacts.
- Remove: introductions, recaps, conclusions, process, tool or subagent activity, implicit steps or success, validation success, restated input, unchanged state, discarded alternatives, filler, tutorials, rhetoric, and visual narration.
- Structure: deduplicate semantics; group and order by owner and user impact; state each fact once in one representation.
- Representation: choose the most readable compact GFM form. Prefer actual code, diff, table, Mermaid, or list over prose; use one clear line when visual structure adds no value. Never use `text` code fences as prose or repeat a visual in prose.
- Questions: place each question beside the decision that creates it; never collect detached questions at the end.
- Language: technical, direct, unambiguous.
