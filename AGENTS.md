## Behavior

- Treat requested behavior and preferences as authority.
- Verify factual, causal, and mechanism claims against available evidence.
- Load every skill whose description matches the assigned work before acting.
- Treat every loaded instruction, skill, and reference as a strict requirement, not a suggestion.
- Complete the assigned work without expanding its scope.
- For a non-Git objective, treat unmentioned repository state as unrelated. Do not inspect it with Git unless direct target evidence conflicts.
- Never invent missing information or select an assumption that can change user-visible behavior.
- Stop when required information is missing or evidence conflicts with the assignment.
- Report the exact conflict or missing input through the applicable output contract.

## Communication

### Vocabulary

| Term               | Meaning                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Contract           | Accumulated behavior, scope, and exclusions explicitly approved for the current experiment                         |
| Owner              | Sole abstraction responsible for a behavior, state, fact, or lifecycle                                             |
| Coupled path       | Dataflow, lifecycle, configuration, and proof directly required by the owner                                       |
| Boundary           | Point where unknown external data is decoded once                                                                  |
| Typed value        | Internal value guaranteed by its type or boundary schema                                                           |
| Reachable failure  | Typed failure permitted by the Contract                                                                            |
| Semantic duplicate | Repeated meaning, responsibility, behavior, functionality, effect, or representation regardless of syntax or name  |
| Construction       | Smallest explicit sole implementation completing the Contract                                                      |
| Program design     | Files, ownership, types, signatures, call paths, and test seams                                                    |
| Instructions       | Mandatory constraints from root AGENTS.md, every loaded skill, and every loaded reference                          |
| Enforcement        | TypeScript, Oxlint, Oxfmt, effect-tsgo, React Compiler/Doctor, Fallow, and custom static rules                     |
| Base               | Explicit comparison ref: preceding stack branch, actual pull-request base, or fetched remote default branch        |
| Candidate          | Every commit after the Base plus staged, unstaged, deleted, renamed, generated, and untracked files                |
| Workflow           | AGENTS.md, skills and references, native agents, configuration, Enforcement, and evaluation fixtures               |
| Ephemeral agent    | Fresh subagent spawned without inherited turns                                                                     |
| Read validity      | Complete read remains authoritative until source change, context loss, conflicting evidence, or an exact-text gate |
| Material delta     | Smallest non-derivable information changing the recipient's decision, outcome, risk, or required action            |
| Safe checkpoint    | Reversible point where evidence or the user resolved every material decision required for the next edit            |

### Output selection

- Treat every agent-authored response, prompt, result, issue, pull request, commit message, and other artifact as rendered GFM for its recipient.
- Write for an expert software developer with ASD-STE100 Simplified Technical English and only the grammar required for one interpretation.
- Output only information whose omission can change the recipient's decision, action, outcome, risk, or required verification.
- Keep research evidence, source citations, tool activity, and implementation detail internal unless the recipient requests them or they are required to establish a conflict, uncertainty, failure, or non-derivable claim.
- Omit acknowledgement, narration, introduction, transition, recap, conclusion, offer, inventory, count, mechanism, repeated history, routine success, and derivable context unless the recipient requested that information.
- For requested analysis, return the conclusion, sole reusable cause, and required action. Omit supporting counts, chronology, and internal mechanics unless they change a decision.
- After changing state, report only resulting behavior and required user action. Omit investigation and implementation history.
- When correcting the user's recalled codebase fact, give only the brief reminder needed to restore context unless detail changes a decision.
- Present only materially viable alternatives at the same level. When one Construction is clearly superior and satisfies the Contract, present it alone. Mention a rejected alternative only when its rejection changes the decision.
- Prefer a standard precise leading word. Define or use repository Vocabulary only when it removes a real ambiguity.
- Report every execution failure once in one brief item. Include remaining impact or completed recovery only when material.

### Representation

- Use one semantic owner and one representation per fact. Never restate a table, diagram, code block, list, diff, or callout in prose.
- Complete each fact at its first occurrence. Do not foreshadow it, split it across sections, or revisit it in another representation.
- Use one direct sentence when it is sufficient. Use a table only for comparable repeated fields and an appropriate Mermaid diagram only when it communicates a relationship more clearly than prose.
- Prefer a minimal example or code block when it communicates the complete fact without explanation. Do not pair an example with prose that the recipient can derive from it.
- Use a typed code block for code, `shell` for commands, and a diff for state changes. Use literal blocks only when whitespace matters; never use a `text` fence as prose.
- Use any number of independent GFM callouts. A callout may contain paragraphs, lists, or code blocks. Select only the supported semantic type: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, or `CAUTION`.

### Questions and blockers

#### Non-blocking

> **Question:** Is the unresolved decision stated directly?

#### Blocking

> [!IMPORTANT]
> **Blocked decision:** Name the exact decision and preserved objective.
>
> **Question:** Ask the minimum question required to continue.

- Place each question beside the decision it controls. Group independent questions and omit questions that evidence can resolve.
- A blocker names the preserved objective, completed state, exact failure, effect, and next action.
- Name the exact actor, object, action, and state. Separate observed fact, inference, decision, failure, effect, and next action.

### Result sections

| Section    | Content                                                    |
| ---------- | ---------------------------------------------------------- |
| `Changed`  | User-relevant deltas from the preceding state              |
| `Next`     | Continuing approved objective                              |
| `Failures` | Every failed execution, including recovered failures, once |

#### Failure

```markdown
- **Failure:** Exact failed action; remaining impact or completed recovery when material.
```

Omit empty sections. Keep successful mandatory validation and proof implicit.

## Validation

| Candidate                     | Exact command                               |
| ----------------------------- | ------------------------------------------- |
| Only Markdown files changed   | `vp run fix`                                |
| Any non-Markdown file changed | `vp run fix && vp run check && vp run test` |

Use no flags, paths, partials, underlying tools, builds, or substitutes.

## Product scope

| Lead     | Requirement                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Optimize | Serve only the user's actual personal-software workflow.                                                                         |
| Minimize | Use the simplest Construction that solves the root problem. Keep unnecessary additions outside scope.                            |
| Exclude  | Do not add configurability, extensibility, compatibility, migration, onboarding, or hypothetical support without a current need. |
| Break    | Preserve backward or forward compatibility only when the Contract requires it.                                                   |
| Replace  | Keep one current path per behavior. Remove a superseded path across its Coupled path.                                            |
