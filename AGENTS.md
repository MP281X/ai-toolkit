## Repository

- Workspace: use `vp`; members live under `apps/*` and `packages/*`.
- Runtime: Effect owns application logic; other code is boundary interop.
- Dependencies: inspect cloned repositories; never inspect `node_modules` source.

| Question                         | Authority                         |
| -------------------------------- | --------------------------------- |
| Requested behavior               | task or canonical issue           |
| Current product behavior         | source and complete diff          |
| Dependency API or semantics      | matching `.agents/repos/*` source |
| Active dependency or enforcement | manifests, lockfiles, config      |
| Installed command interface      | CLI help                          |

## Change

- Align: changed behavior, owning abstraction, and directly coupled dataflow.
- Preserve: unrelated behavior and user changes.
- Simplify: remove obsolete architecture, compatibility paths, empty directories, and alternate implementations; retain one current path.
- Break: internal compatibility when the resulting current design is smaller and the requested behavior remains complete.

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
- Delta: include only information absent from source, instructions, workflow, and linked artifacts.
- Ownership: state each fact once at its semantic owner.
- Order: complete one topic before starting another.
- Evidence: code or command → fitting visualization → table or list → prose.
- Representation: use the smallest complete GFM structure; prose only when structure cannot express the fact.
- Language: technical, direct, unambiguous.
- Reason: retain only reasoning that changes a decision or correction.
- Visual: one representation owns each fact; never narrate it.
- Keep: every retained word changes behavior, precision, routing, or correction.
- Remove: introductions, recaps, conclusions, filler, tutorials, history, rhetoric, and visual narration.
- Output: workflow-specific final contract.

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
