## Repository

- `vp`; workspaces `apps/*`, `packages/*`.
- Effect owns application logic; other code is boundary interop.

## Work

- Decide from current source, status, and the complete relevant diff. Application behavior follows its nearest source; tool APIs follow installed schema/source/help; matching `.agents/repos/*` supplies rationale. Memory is last.
- Preserve behavior outside scope and remove emptied directories.
- Remove obsolete architecture first; leave one root-cause solution without transitional or compatibility paths.

## Authorization

- Subagents may inspect and mutate delegated runtime or external state, never repository files.
- Git and GitHub mutations require workflow or explicit user authority. Agents never merge.

## Verification

| Change | Finish with |
|---|---|
| Code · executable config · dependencies · generated source · tests | `vp run fix && vp run check && vp run test`; resolve related failures at their shared cause |
| Markdown · instructions only | `git diff --check`; inspect rendered GFM; synchronize affected metadata |

## Communication

- Show, do not describe: code/commands, UI prototypes, Mermaid relationships, tables for repeated fields, then minimal prose.
- Use dense GFM, semantic labels, and simple English. State only the decision/action delta; represent each fact once.
- Never explain visuals, recap, mirror lists, duplicate policy, or add introductions, transitions, or conclusions.
- Never present delegated work as completed before its result arrives. Follow workflow-specific final-output contracts.
