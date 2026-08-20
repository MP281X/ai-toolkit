# OpenCode Sessions

Load `customize-opencode` for configuration, agents, skills, permissions, references, plugins, or restart behavior. This reference owns only session and conversation-history investigation.

## Authority

| Question                                | Source                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Installed session and database commands | `opencode session --help`, `opencode export --help`, and `opencode db --help`                                         |
| Database path and schema                | Configured `opencode` reference: `packages/core/src/database/database.ts` and `packages/core/src/session/sql.ts`      |
| Session lifecycle and context           | `packages/core/src/session.ts`, `packages/core/src/session/history.ts`, and `packages/core/src/session/compaction.ts` |
| Tool and model events                   | `packages/core/src/session/runner`                                                                                    |
| Export shape                            | `packages/app/src/utils/session-export.ts`                                                                            |

## Reconstruction

1. Use `opencode db`, `opencode session`, and `opencode export` commands. Do not access the database file directly or require `sqlite3`.
2. Follow `session.parent_id` to reconstruct primary and task-subagent lineage.
3. Preserve persisted message and part sequence. Distinguish user content, assistant content, reasoning, tool calls, tool results, and durable events.
4. Apply the latest compaction and context-epoch boundary before describing what the model could still see. Persisted history and reconstructed model context are different facts.
5. Compare the accumulated user objective, agent decisions, interruptions, corrections, and final state. Do not use timestamps to reorder persisted sequence.

## Result

Return supported behavior, conflicting evidence, responsible Workflow owner, and the narrowest reusable correction. Report unresolved lineage or context boundaries instead of inventing them.
