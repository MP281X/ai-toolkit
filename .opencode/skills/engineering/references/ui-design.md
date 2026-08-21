# UI Design

Preserve an established design system. When none exists, establish one deliberate visual direction and use it consistently.

## Construction

| Concern        | Requirement                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Purpose        | Make the primary state and action immediate                                                       |
| Representation | Show each fact and action once                                                                    |
| Hierarchy      | Prefer order, spacing, dividers, and typography over nested containers                            |
| Containers     | Use a card only for an independently meaningful entity; never nest cards                          |
| Actions        | Keep one entry point per context; prefer a conventional icon when it is clearer than text         |
| Icons          | Use the existing icon system; add a tooltip only when meaning is not conventional                 |
| State          | Represent loading, empty, failure, optimistic, reconnecting, and authoritative updates coherently |
| Feedback       | Make action results immediate, causal, and non-distracting                                        |
| Mobile         | Preserve complete hierarchy, interaction, and dense controls at narrow widths                     |
| Performance    | Keep input response, rendering, layout, console, and network behavior clean                       |

## Review

Rendered behavior is the final UI evidence. Inspect every affected flow at relevant desktop and mobile sizes; source inspection alone is insufficient.
