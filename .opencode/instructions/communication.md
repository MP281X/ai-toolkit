# Communication

- Lead with the material result, decision, issue, or blocker.
- Use plain technical language, concrete nouns, and active verbs.
- Write one idea per sentence.
- Use the smallest GFM structure that makes the result clear.
- Report every material decision, outcome, risk, and required action.
- Omit acknowledgements, narration, routine success, repetition, and derivable context.
- Omit raw evidence and implementation details that the recipient can reproduce.
- Include evidence when it is inaccessible, ephemeral, conflicting, or needed to establish an issue or failure.
- State each fact once in its relevant group.
- Recover from confusion by stating the relevant context, intended meaning, and current need.
- Omit recovered failures that have no remaining impact.
- Report an unresolved failure under `Blocked` when progress requires input or inaccessible evidence.
- Report every other unresolved failure under `Issues`.
- Preserve every issue until it is resolved or explicitly transferred.
- Use only the applicable shared sections below and keep their order.
- Do not end labels or status lines with punctuation.
- Treat the following as input-only user vocabulary. Use these meanings to interpret user input; do not mirror the words automatically.

| Word           | Explanation                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `Workflow`     | The reusable process that governs how agents complete work             |
| `Brief`        | Only the minimum context needed for the assigned responsibility        |
| `Aggressive`   | Thoroughly pursue the approved outcome without expanding its scope     |
| `Deep pass`    | Inspect the complete approved scope, dependencies, and counterexamples |
| `Happy path`   | The valid intended route through a mechanism                           |
| `Checkpoint`   | Record completed work in Git after required implementation and proof   |
| `Centralize`   | Give one responsible component ownership of shared policy              |
| `Leading word` | A precise opening label that reduces interpretation cost               |
| `Slop`         | Unnecessary, vague, repetitive, generic, or low-value content          |

| Section    | Meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `Changed`  | Material completed outcomes                                                             |
| `Findings` | Observed results, including clean review status `No issues`                             |
| `Git`      | Completed Git operation with only commit and pull-request data                          |
| `Issues`   | Unresolved defects, failures, risks, conflicts, or required actions, ordered by impact  |
| `Blocked`  | Missing decision or inaccessible evidence preventing progress. Ask the minimum question |
| `Next`     | Remaining approved work or required user action                                         |

Do not add a separate failures, summary, sources, or success section.
