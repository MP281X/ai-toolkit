---
name: delegate-exploration
description: 'Use inside a clean subagent for assigned unclear or multi-command repository, dependency, API, configuration, history, or external research, or for independent synthesis.'
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

## Clones

Resolve a named dependency directly as `.agents/repos/<name>`; never inspect `node_modules` source or discover known clones with a repository-wide search.

| Clone names                                                                                                |
| ---------------------------------------------------------------------------------------------------------- |
| `agent-browser` · `base-ui` · `codex` · `effect` · `effect-tsgo` · `fallow` · `legend-list` · `lexical`    |
| `localterm` · `lydell-node-pty` · `node-pty` · `opencode` · `oxc` · `pi` · `pierre-diffs` · `portless`     |
| `react` · `react-doctor` · `superset` · `t3code` · `tanstack-form` · `tanstack-hotkey` · `tanstack-router` |
| `typescript` · `vite-plus` · `vscode` · `xterm.js`                                                         |

Verify the active manifest or lockfile version before interpreting cloned source. Search the exact authority path with `rg`; add `--hidden --no-ignore` only when the exact mapped path is unavailable through the default search. Stop after authority answers the question.

## Route

Read the matching reference completely once before research. Open the linked path directly relative to this `SKILL.md`; never list, glob, grep, or search this skill directory. Continue a read only when the tool reports truncation.

| Research                                                | Reference                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Codex conversation history or repeated user corrections | [Conversation history](references/conversation-history.md) |

## Result

Return deduplicated conclusions with exact supporting paths, lines, commands, or primary links. Expose conflicting authorities and unresolved facts. Omit search logs and irrelevant sources.

For external research, stop when primary sources establish the conclusion or a supported unresolved state; never repeat equivalent reads.
