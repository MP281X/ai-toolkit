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

| Section    | Meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `Changed`  | Material completed outcomes                                                             |
| `Findings` | Observed results, including clean review status `No issues`                             |
| `Issues`   | Unresolved defects, failures, risks, conflicts, or required actions, ordered by impact  |
| `Blocked`  | Missing decision or inaccessible evidence preventing progress. Ask the minimum question |
| `Next`     | Remaining approved work or required user action                                         |

Do not add a separate failures, summary, sources, or success section.
