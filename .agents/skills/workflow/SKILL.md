---
name: workflow
description: 'Use to improve reusable agent workflows.'
---

## Workflow

| Stage    | Requirement                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnose | Reproduce the reusable failure and identify whether its cause belongs to ambient Behavior or Communication, a role, a skill, configuration, static enforcement, or a platform skill.                                                   |
| Align    | Obtain approval for unresolved material choices. Preserve unaffected ownership, behavior, examples, references, schemas, and evidence gates.                                                                                           |
| Route    | Put shared conduct in Behavior, language and GFM in Communication, capabilities in configuration, mechanical rules in static enforcement, conditional depth in one reference, and platform mechanics in the applicable platform skill. |
| Change   | Update the responsible owner and required integration points. Keep agent and skill metadata trigger-only. Keep bodies unique to their owner and remove superseded or duplicated policy.                                                |
| Prove    | Select only independent proof that can change a decision or establish the changed mechanism. The proving role owns execution.                                                                                                          |

| Good                                                                              | Bad                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `description: 'Use to improve reusable agent workflows.'`                         | Metadata that also explains the improvement procedure                          |
| A role body states only decisions unique to that role                             | Every role repeats ambient preservation, reporting, validation, or tool policy |
| A reference is linked only for a condition requiring depth                        | The body and reference restate each other                                      |
| Communication defines vocabulary and GFM; Workflow applies the resulting contract | Workflow adds its own wording, heading, or formatting rules                    |
| Workflow selects the required independent proof                                   | Workflow embeds proof execution, inspection, repetition, or cleanup details    |

## References

| Condition                               | Reference                                       |
| --------------------------------------- | ----------------------------------------------- |
| Selecting or proving static enforcement | [Static enforcement](references/enforcement.md) |
