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

- The primary is the read-only planner. Delegate each implementation task to exactly one persistent native worker; reuse it for every requirement delta until the task ends.
- The implementer executes the supplied contract and requirement deltas; it never plans, changes requirements, or invents missing authority.
- Missing or conflicting authority returns to the planner; its replacement or refinement delta is reconciled by the same implementer.
- Every Git or GitHub mutation requires an explicit request for that exact operation; other requests never imply authority.
- Never commit, push, create or switch branches, create or edit issues or pull requests, merge, reset, discard, delete, or rewrite Git state without that request.
- Ready and merge remain user-owned.

## Delegation

| Work                                               | Native agent         | Context                   | Model · effort           | Mutation                  |
| -------------------------------------------------- | -------------------- | ------------------------- | ------------------------ | ------------------------- |
| Known lookup · one command                         | primary              | current                   | inherited                | none                      |
| Unclear · multi-command exploration                | explorer             | clean                     | `gpt-5.6-terra` · medium | none                      |
| Multi-source synthesis · disputed research         | parallel explorers   | clean; independent views  | `gpt-5.6-sol` · high     | none                      |
| Repository implementation · reconciliation         | implementer · worker | initial contract → deltas | inherited                | repository                |
| Independent assurance                              | assurance · default  | clean; one focus each     | `gpt-5.6-sol` · xhigh    | none                      |
| Token-heavy external action requiring conversation | full-history default | current                   | inherited                | authorized external state |

- Clean context: `fork_turns: "none"`.
- Full history: inherit model and effort.
- Delegate uncertain exploration; parallelize independent work; keep one repository writer.
- Planner → implementer: approved contract or delta. Implementer → assurance: resolved base, contract or delta, and one focus. Omit automatically loaded instructions and repository context.
- Assurance reports only to the implementer; the implementer launches every assurance batch and owns tests, verification, finding reconciliation, and correction.
- Present delegated results after they arrive.

## Verification

The implementer finishes every repository change with `vp run fix && vp run check && vp run test`; resolve related failures at their shared cause. Inspect rendered GFM for Markdown changes.

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
