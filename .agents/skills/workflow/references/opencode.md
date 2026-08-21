# OpenCode Sessions

Load `opencode` for configuration, agents, skills, permissions, references, or plugins. This reference owns only session and conversation-history investigation.

## Authority

| Question                   | Source                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed command behavior | `opencode2 --help`, `opencode2 api --help`, and `opencode2 export --help`                                                                                     |
| Installed API contract     | `/openapi.json`                                                                                                                                               |
| Session API                | Configured `opencode@v2` reference: `packages/protocol/src/groups/session.ts` and `packages/protocol/src/groups/message.ts`                                   |
| Session and export shapes  | Configured `opencode@v2` reference: `packages/schema/src/session.ts`, `packages/schema/src/session-message.ts`, and `packages/schema/src/session-transfer.ts` |

## Reconstruction

1. Primary delegates conversation-history reconstruction to Research and inspects current Workflow owners while Research runs.
2. Split independent lineage or usage measurement and causal context reconstruction across Research agents when parallel execution reduces the critical path. Do not duplicate their evidence reads on Primary.
3. List sessions with `opencode2 api get /api/session`.
4. Read one session with `opencode2 api get /api/session/<session-id>` and active sessions with `opencode2 api get /api/session/active`.
5. Read messages with `opencode2 api get /api/session/<session-id>/message`.
6. Export with `opencode2 export <session-id>` or `opencode2 api get /api/session/<session-id>/export`.
7. Reconstruct primary and subagent lineage from parent and session identifiers returned by the session API.
8. Preserve persisted message and part sequence. Distinguish user content, assistant content, reasoning, tool calls, tool results, and durable events.
9. Apply the latest compaction and context-epoch boundary before describing what the model could still see. Persisted history and reconstructed model context are different facts.
10. Compare the accumulated user objective, agent decisions, interruptions, corrections, and final state. Do not use timestamps to reorder persisted sequence.
11. Do not access the database directly.

## Result

Return the conclusion, sole reusable cause, and narrowest correction. Include counts, chronology, supporting evidence, or unresolved boundaries only when they change the correction or the user's next action.
