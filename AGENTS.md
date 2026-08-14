## Authority

| Question                         | Authority                           |
| -------------------------------- | ----------------------------------- |
| Requested behavior               | Task or canonical issue             |
| Current behavior                 | Source and complete candidate       |
| Dependency API or semantics      | Matching `.agents/repos/*` source   |
| Active dependency or enforcement | Manifests, lockfiles, configuration |
| Installed command interface      | CLI help                            |

## Vocabulary

| Term               | Meaning                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Contract           | Requested current behavior from the task or canonical issue                                                       |
| Owner              | Sole abstraction responsible for a behavior, state, fact, or lifecycle                                            |
| Coupled path       | Dataflow, lifecycle, configuration, and proof directly required by the owner                                      |
| Boundary           | Point where unknown external data is decoded once                                                                 |
| Typed value        | Internal value guaranteed by its type or boundary schema                                                          |
| Reachable failure  | Typed failure permitted by the contract                                                                           |
| Semantic duplicate | Repeated meaning, responsibility, behavior, functionality, effect, or representation regardless of syntax or name |
| Construction       | Smallest explicit sole implementation completing the contract                                                     |
| Program design     | Files, ownership, types, signatures, call paths, and test seams                                                   |
| Instructions       | Mandatory constraints from this file plus every invoked skill and loaded reference                                |
| Enforcement        | TypeScript, Oxlint, Oxfmt, effect-tsgo, React Compiler/Doctor, Fallow, and custom static rules                    |
| Base               | Explicit comparison ref: preceding stack branch, actual pull-request base, or fetched remote default branch       |
| Candidate          | Every commit after the base plus staged, unstaged, deleted, renamed, generated, and untracked files               |

## User-visible writing

- Audience: expert software developer.
- Output: declarative current state; retain only authoritative delta since the previous user-visible response.
- Keep: current decisions, unresolved questions, requested artifacts, material corrections or evidence, required user actions.
- Remove: acknowledgements, introductions, recaps, summaries, conclusions, transitions, unchanged or resolved history, discarded alternatives, reasoning, process, tool activity, implicit steps or success, validation success, filler, tutorials, rhetoric, formatting commentary, and visual narration.
- Structure: one semantic owner and representation per fact; deduplicate, group, and order by owner and user impact.
- Representation: Mermaid for relationships, sequence, state, lifecycle, or hierarchy; tables for repeated fields or comparison; diffs for state changes; typed code blocks for code; shell blocks for commands; literal blocks only when whitespace or literal content matters; otherwise minimal technical prose.
- Never use `text` code fences as prose or repeat a visual in prose.
- Questions: place each beside the decision that creates it.
- Language: technical, direct, unambiguous.
