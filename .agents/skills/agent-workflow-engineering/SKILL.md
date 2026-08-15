---
name: agent-workflow-engineering
description: 'Use for any change, review, or evaluation of AGENTS.md, skills, agents, configuration, enforcement, rules, or Workflow references.'
---

Make the smallest approved change that causes independent runs to follow the intended workflow. Preserve every unaffected instruction and behavior; never treat a local correction as authority to redesign the complete system.

## Route

Applicable work routes to:

| Work                                                             | Reference                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Diagnosing behavior from current or previous agent conversations | [Conversation history](references/conversation-history.md) |
| Existing or custom static enforcement                            | [Enforcement](references/enforcement.md)                   |
| Explicit final workflow evaluation                               | [Evaluation](references/evaluation.md)                     |
| Codex prompting, configuration, skills, or agents                | [Codex](references/codex.md)                               |

## Ownership

| Owner                  | Surface                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md`            | Unconditional authority, vocabulary, loading, collaboration, scope, validation, writing |
| Skill `description`    | Sole trigger for loading the skill                                                      |
| Agent `description`    | Dispatch trigger and minimum inputs the parent must pass                                |
| Native agent body      | Bounded execution procedure after dispatch                                              |
| Domain skill body      | Conditional workflow or engineering guidance                                            |
| Skill reference        | One genuinely conditional branch                                                        |
| Platform configuration | Runtime capability and tool policy                                                      |
| Static enforcement     | Mechanically detectable repository constraints                                          |
| Evaluation             | Generic proof of routing, behavior, integration, and stability                          |

Keep only frequent, architectural, or routinely misapplied guidance. Prefer configuration for capabilities and maintained static enforcement for mechanical rules. Route to the sole semantic owner instead of duplicating identical, similar, or implied instructions across Workflow artifacts.

## Workflow-first correction

Treat every reported agent-behavior problem, including a failure of this skill, as a potential reusable Workflow defect. Workflow work opened during another task is a self-contained branch that preserves the parent state.

1. Analyze the relevant current and previous parent and subagent conversations before diagnosing the issue. Reconstruct the accumulated contract, steering, orchestration, results, and accepted final state; do not infer the cause from the latest complaint alone.
2. Verify that the reported issue exposes a reusable Workflow cause rather than only a local candidate preference.
3. Propose the narrowest correction and wait for approval; unrequested extensions remain non-persistent out-of-scope notes.
4. Change the narrowest Workflow owner before correcting affected product code.
5. Give fresh Assurance the changed Workflow and unchanged defective candidate without the expected finding. If the defect is not independently detected, revise the Workflow owner.
6. After detection, correct the product candidate and confirm the fix plus valid counterexamples.
7. Resume the preserved parent task at its previous next step without asking for it again.

Run repeated holdout evaluation only when explicitly finalizing or evaluating the workflow, not during normal iteration.

## Output

Return only material behavioral changes, remaining conflicts or uncertainties, and the next decision.
