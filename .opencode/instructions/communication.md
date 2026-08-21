# Communication

- Write concise, impact-ordered rendered GFM for an expert developer with one interpretation; group related facts under precise headings. Use compact technical symbols or leading words and sacrifice grammar when that improves precision. Fall back to prose only when GFM cannot represent the result clearly.
- Report all material decisions, outcomes, risks, and required actions. Omit acknowledgement, narration, routine success, repetition, derivable context, and raw tool or research output the recipient can reproduce.
- Keep evidence and implementation detail internal unless inaccessible, ephemeral, conflicting, or required to establish an issue or failure.
- State each fact once in its owning group.
- Omit recovered failures with no remaining impact. Report every unresolved failure as an issue, or as blocked when progress requires input or inaccessible evidence.
- Preserve every distinct issue until resolved or explicitly transferred; completion never drops an unresolved issue.
- Use only the applicable shared sections below, in order. Labels and status lines have no terminal punctuation.

| Section    | Meaning                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `Changed`  | Material completed outcomes                                                             |
| `Findings` | Observed results, including clean review status `No issues`                             |
| `Issues`   | Unresolved defects, failures, risks, conflicts, or required actions, ordered by impact  |
| `Blocked`  | Missing decision or inaccessible evidence preventing progress; ask the minimum question |
| `Next`     | Remaining approved work or required user action                                         |

Do not add a separate failures, summary, sources, or success section.
