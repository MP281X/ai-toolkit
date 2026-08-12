## Repository

- Workspace: use `vp`; members live under `apps/*` and `packages/*`.
- Runtime: Effect owns behavior and state; servers are authoritative; streaming RPC synchronizes Atom; React presents; adapters translate external interfaces.
- Dependencies: inspect cloned repositories; never inspect `node_modules` source.

| Question                         | Authority                         |
| -------------------------------- | --------------------------------- |
| Requested behavior               | task or canonical issue           |
| Current product behavior         | source and complete diff          |
| Dependency API or semantics      | matching `.agents/repos/*` source |
| Active dependency or enforcement | manifests, lockfiles, config      |
| Installed command interface      | CLI help                          |

## Vocabulary

| Term               | Meaning                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Contract           | Requested current behavior from the task or canonical issue                                    |
| Owner              | Sole abstraction responsible for a behavior, state, fact, or lifecycle                         |
| Coupled path       | Dataflow, lifecycle, configuration, and proof directly required by the owner                   |
| Boundary           | Point where unknown external data is decoded once                                              |
| Typed value        | Internal value guaranteed by its type or boundary schema                                       |
| Reachable failure  | Typed failure permitted by the contract                                                        |
| Semantic duplicate | Repeated meaning, responsibility, behavior, or representation regardless of syntax or name     |
| Construction       | Smallest explicit sole implementation completing the contract                                  |
| Instructions       | Mandatory constraints from this file plus every invoked skill and loaded reference             |
| Enforcement        | TypeScript, Oxlint, Oxfmt, effect-tsgo, React Compiler/Doctor, Fallow, and custom static rules |

## Change

- Implement the contract at its owner with the construction.
- Trust typed values; validate only boundaries; omit states excluded by types or schemas.
- Propagate the first reachable failure; retry or recover only when required by the contract.
- Treat enforcement diagnostics as evidence of their earliest shared cause; correct the owner, not symptoms.
- Complete the owner and coupled path; aggressively remove everything outside the construction, including semantic duplicates, empty directories, and unused branches, props, schema fields, state, types, exports, dependencies, and wrappers; internal compatibility does not preserve it.
- Preserve unrelated behavior and user changes.

## Authorization

- Repository writes stay with the primary agent.
- Git and GitHub writes require explicit authority or an invoked workflow that authorizes them.
- Ready and merge remain user-owned.

## Delegation

| Work                                               | Context                    | Model · effort           | Mutation                  |
| -------------------------------------------------- | -------------------------- | ------------------------ | ------------------------- |
| Known lookup · one command                         | primary                    | inherited                | none                      |
| Unclear · multi-command exploration                | clean                      | `gpt-5.6-terra` · medium | none                      |
| Multi-source synthesis · disputed research         | clean; parallel viewpoints | `gpt-5.6-sol` · high     | none                      |
| Independent acceptance testing                     | clean                      | `gpt-5.6-sol` · high     | delegated runtime         |
| Independent adversarial review                     | clean                      | `gpt-5.6-sol` · xhigh    | none                      |
| Token-heavy external action requiring conversation | full history               | inherited                | authorized external state |
| Repository implementation · integration            | primary                    | inherited                | repository                |

- Clean context: `fork_turns: "none"`.
- Full history: inherit model and effort; complete the external action.
- Parallelize independent work; serialize overlapping writes.
- Present delegated results after they arrive.

## Verification

| Change                                                             | Finish with                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Code · executable config · dependencies · generated source · tests | `vp run fix && vp run check && vp run test`; resolve related failures at their shared cause |
| Markdown · instructions only                                       | `git diff --check`; inspect rendered GFM; synchronize affected metadata                     |

## Writing

- Audience: expert software developer.
- Delta: retain only authoritative-input delta that changes behavior, precision, routing, decision, or correction.
- Ownership: state each fact once, at its semantic owner, in one representation.
- Order: complete one topic before starting another.
- Representation: use the smallest complete GFM structure; prose only when structure cannot express the fact.
- Language: technical, direct, unambiguous.
- Remove: introductions, recaps, conclusions, filler, tutorials, history, rhetoric, and visual narration.

| Information                      | Representation                |
| -------------------------------- | ----------------------------- |
| Code behavior or convention      | titled `BAD` / `GOOD` block   |
| Existing → required state        | `diff` block                  |
| Command or invocation            | shell block                   |
| Sequence, lifecycle, state       | Mermaid flow or state diagram |
| Ownership, dependency, hierarchy | Mermaid graph                 |
| Repeated fields or comparison    | table                         |
| Ordered execution                | numbered list                 |
| Independent requirements         | bullet or task list           |
| Critical constraint              | GFM alert                     |
| Secondary optional detail        | `<details>`                   |
