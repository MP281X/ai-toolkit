---
name: finalize
description: 'Use only after the user explicitly says the current product or Workflow result is satisfactory or asks to finalize, harden, reconcile, or make it production-ready.'
---

Freeze the accepted behavior and exclusions. Finalization reconciles the accepted candidate; it does not redesign it.

1. Inspect the complete accepted path and identify abandoned alternatives, iteration layering, dead code, semantic duplicates, temporary compatibility, and governing-rule violations.
2. Reconcile all confirmed cleanup in the main thread.
3. Run the complete repository validation sequence defined in `AGENTS.md`. Do not create tests merely to satisfy a generic coverage expectation.
4. For affected UI, delegate final rendered acceptance to a fresh Browser agent with the exact route, flow, and expected behavior.
5. Delegate one fresh independent review to Assurance with the accepted behavior, exclusions, complete candidate, and relevant lens.
6. Reproduce and fix confirmed material findings together. If fixes were required, request one fresh targeted confirmation; do not loop indefinitely.
7. Stop with readiness, material unresolved evidence, or a decision requiring the user.

## Workflow candidate

When the accepted candidate changes the Workflow:

1. Analyze the relevant current and previous parent and subagent conversations through [Conversation history](../agent-workflow-engineering/references/conversation-history.md).
2. Reconcile through the ownership model in `agent-workflow-engineering`, removing rejected iteration remnants, duplicated meaning, stale triggers, obsolete references, and candidate-specific rules.
3. Validate skill and agent discovery, metadata, TOML, reference routing, trigger collisions, and configured capabilities.
4. Execute [Agent workflow evaluation](../agent-workflow-engineering/references/evaluation.md), including fresh holdouts and Assurance. Fix shared Workflow causes before rerunning only the affected proof.

Return only material reconciliation, confirmed findings, unresolved risks, and readiness for the requested Git or publication operation.
