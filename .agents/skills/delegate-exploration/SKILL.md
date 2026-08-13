---
name: delegate-exploration
description: 'Use inside a clean subagent for every repository, dependency, API, configuration, history, or external-source fact-finding task.'
---

Research the assigned bounded question deeply and read-only. Never edit, mutate external state, or delegate.

## Authority

| Question                         | Authority                         |
| -------------------------------- | --------------------------------- |
| Requested behavior               | task or canonical issue           |
| Current product behavior         | source and complete diff          |
| Dependency API or semantics      | matching `.agents/repos/*` source |
| Active dependency or enforcement | manifests, lockfiles, config      |
| Installed command interface      | CLI help                          |
| External or current fact         | primary external source           |

Inspect dependency implementations only in `.agents/repos/*`; never inspect `node_modules` source. Verify the active version before interpreting cloned source.

## Route

Read the matching reference completely once before research. Open the linked path directly relative to this `SKILL.md`; never list, glob, grep, or search this skill directory. Continue a read only when the tool reports truncation.

| Research                                                | Reference                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Codex conversation history or repeated user corrections | [Conversation history](references/conversation-history.md) |

## Result

Return deduplicated conclusions with exact supporting paths, lines, commands, or primary links. Expose conflicting authorities and unresolved facts. Omit search logs and irrelevant sources.
