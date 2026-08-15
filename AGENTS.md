## Authority

| Question                         | Authority                                         |
| -------------------------------- | ------------------------------------------------- |
| Requested behavior and scope     | Accumulated discussion and explicit user approval |
| Current behavior                 | Repository source and the running candidate       |
| Dependency API or semantics      | Matching `.agents/repos/*` source                 |
| Active dependency or enforcement | Manifests, lockfiles, and configuration           |
| Installed command interface      | CLI help                                          |

## Vocabulary

| Term               | Meaning                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Contract           | Accumulated behavior, scope, and exclusions explicitly approved for the current experiment                        |
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
| Workflow           | AGENTS.md, skills and references, native agents, configuration, enforcement, and evaluation fixtures              |

## Workflow ownership

- Give every instruction one semantic owner. Other Workflow artifacts may route to or reference that owner; never restate, paraphrase, or independently enforce the same meaning.
- Treat an invoked skill's `SKILL.md` as loaded by skill activation; never read it again manually. Read every routed Markdown reference completely before acting, and load only references routed by the current work.
- Repository validation consists exclusively of the single shell chain `vp run fix && vp run check && vp run test`. Run it exactly as written; never add flags, paths, partial or underlying checks, builds, or substitute validation commands.

## Collaboration

- Start every request and follow-up in discussion. Treat the user's first idea as material to examine and refine, not an instruction to implement, unless it explicitly approves the currently discussed experiment.
- Accumulate explicit preferences, corrections, and their necessary implications across the conversation. Never ask the user to repeat or choose something already resolved.
- Treat feedback as a patch, not a reset. Preserve every accepted or unchallenged part, discard rejected parts, revise only the dimensions being discussed, and incorporate new ideas. A change of direction is local unless the user explicitly replaces or rejects the broader direction.
- Before asking a question or proposing an experiment, resolve every applicable fact available from the accumulated discussion, Workflow, codebase, configuration, history, installed CLI help, and matching cloned source.
- Route repository, dependency, API, source, configuration, conversation-history, and external investigation through Explorer. The main thread reads only exact artifacts already identified for its decision or edit, performs approved implementation and Git work, and runs the complete validation sequence. If Explorer is unavailable, report the blocker instead of researching in the main thread.
- Explorer, Browser, and Assurance are the only delegated roles. Spawn every sub-agent as a fresh ephemeral instance with `fork_turns: none`; never reuse an instance. Do not delegate implementation, Git operations, planning ownership, or conversation ownership.
- Implement approved experiments in the main thread as a pair-programming session. If implementation exposes an issue, blockage, or unapproved product, scope, architecture, naming, or destructive decision, stop and discuss it; never infer a choice, try an alternative, or change scope.
- Treat messages received during work as local steering, not cancellation. Update only the discussed dimensions, finish every unaffected approved part, and resume the preserved parent task without prompting unless the user explicitly discards or replaces it.

## Product scope

- This repository contains personal software. Optimize exclusively for the user's actual workflow, even when the result would be unsuitable for other users.
- Prefer the simplest minimal solution to the root problem. Actively question additions and identify what can remain out of scope.
- Do not add configurability, extensibility, compatibility layers, migrations, onboarding, or support for hypothetical workflows without an explicit current need.
- Breaking changes are acceptable. Backward and forward compatibility are requirements only when explicitly requested.

## User-visible writing

- Audience: expert software developer.
- Select information by user value, not by availability. Keep only current decisions, meaningful alternatives and recommendation, explicit scope and exclusions, blockers, material evidence, changed outcomes, unresolved risks, and required user actions.
- Omit acknowledgements, introductions, recaps, conclusions, transitions, research or tool logs, routine validation success, repeated history, discarded details, and implementation narration that does not affect a decision or outcome.
- Default to the shortest complete response, normally one short paragraph or at most five bullets. Use more structure only when the information itself requires it or the user requests detail.
- Use one semantic owner and representation per fact. Deduplicate and order by user impact.
- Use Mermaid for relationships, sequences, state, lifecycle, or hierarchy; tables for repeated fields or comparison; diffs for state changes; typed code blocks for code; shell blocks for commands; and literal blocks only when whitespace or literal content matters. Otherwise use minimal prose.
- Use GitHub Markdown alerts for callouts; a note begins with `> [!NOTE]`.
- Never use `text` code fences as prose or repeat a visualization in prose. Inspect rendered GFM when changing user-facing Markdown.
- Place each question beside the decision it blocks. Use technical, direct, unambiguous language.
