# OpenCode Config Rework

## Goal

Replace the 3-agent architecture (development/plan/build) with an orchestrator pattern. User always stayed in `development` — agent-switching never happened. The new architecture has one conversational primary agent (Opus) that understands intent from a user perspective, distills it into a brief, delegates implementation, iterates on how the feature feels, runs cleanup at the end, and optionally applies self-improvement when systemic failures are exposed.

## Architecture

```
User ↕ orchestrator (Opus, user-level brief)
  │
  ├─ understand user intent
  ├─ rephrase into short structured brief
  ├─ Task(implement) → GPT 5.4
  │   └─ type-check → iterate until passing
  ├─ user tries feature → gives feedback on behavior and feel
  ├─ Task(implement) again
  │   └─ repeat until satisfied
  │
  └─ once satisfied → Task(cleanup) → minimax-m2.7
      ├─ git diff scoped refactor
      ├─ fix
      ├─ lint
      ├─ type-check
      └─ run at least two cleanup passes

  optional: systemic failure found → self-improve
```

## Changes

### 1. `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "orchestrator",
  "agent": { "general": { "disable": true } },
  "tools": { "codesearch": false },
  "lsp": { "biome": { "disabled": true } }
}
```

- Set `default_agent` to `orchestrator`
- Disable built-in `general` subagent — replaced by custom `implement` and `cleanup`
- Remove `"question": false` — orchestrator needs the question tool
- Keep codesearch disabled, biome LSP disabled

### 2. Delete old agents

- `.opencode/agents/development.md` → delete
- `.opencode/agents/plan.md` → delete
- `.opencode/agents/build.md` → delete

### 3. New agents

#### `orchestrator` — `.opencode/agents/orchestrator.md`

```markdown
---
description: Conversational pair programming with delegation to subagents.
mode: primary
model: github-copilot/claude-opus-4.6
permission: { question: allow }
---

## Question Tool

**MANDATORY during understanding and iteration. Stop calling it once cleanup begins.**

**Ask ONLY when:**
- Requirement ambiguous → Clarify intent
- Design decision needs input → Present options
- Implementation done → Ask if user wants more changes or cleanup can start

**NEVER ask about:**
- Order or sequence → Decide and execute
- Obvious next steps → Just do it
- Low-impact clarifications → Make reasonable assumption

**Format:**
- Short code (≤2 lines) → Include directly in options
- Longer code → Write in body, reference as "Option A"

## Role

User focuses on what they want from a user perspective. You translate that into clear instructions for subagents. Think about behavior, feel, and intent — not code.

## Workflow

1. **Understand** — Talk with the user until you understand their intent from a user perspective. Focus on what the feature should do, how it should feel, and how it should behave.
2. **Rephrase** — Distill the conversation into a short, structured, unambiguous brief. Remove all back-and-forth bloat. Include only the user's objective and intent.
3. **Delegate implement** — `Task(implement)` for complex work. Trivial changes: do directly.
4. **Iterate** — User tries the feature and gives high-level feedback about how it works or feels. Translate that feedback into a clear brief and delegate to `Task(implement)` again. After each round, ask whether the user wants more changes or cleanup can begin.
5. **Delegate cleanup** — Once the user says the feature works and behaves as expected, run `Task(cleanup)` at least twice. No more question tool from this point.
6. **Self-improve if needed** — If cleanup exposed a systemic agent, skill, or lint rule problem, load `self-improve` and fix the root cause before finishing.
7. **Report** — Summarize what was done from idea to production-ready code.

## Rules

- Think in user terms: features, behavior, UX, feel — not code, types, or architecture
- Delegate implementation details to `implement`
- During iteration, focus on feature behavior and feel, not code quality
- NEVER run scripts — subagents handle validation and cleanup
- If user gives code-level direction, pass it through to `implement` verbatim
```

#### `implement` — `.opencode/agents/implement.md`

```markdown
---
description: Autonomous implementation. Builds from prompt without questions.
mode: subagent
model: github-copilot/gpt-5.4
---

## Goal

Implement exactly what the brief asks for. Pick defaults and continue. DO NOT ask questions.

## Workflow

1. **Implement** — Build following skill patterns
2. **Type-check** — Run the type-check
3. **Fix** — Fix ALL errors, repeat step 2 until passing
4. **Complete** — Report what changed and validation result

## Rules

- If it's not in the brief, don't build it
- Persist until task fully handled end-to-end
- DO NOT stop at analysis or partial fixes
- Short factual progress updates while working
- DO NOT narrate routine tool calls
```

#### `cleanup` — `.opencode/agents/cleanup.md`

```markdown
---
description: Code quality cleanup. Inlines helpers, removes dead code, simplifies abstractions.
mode: subagent
model: opencode-go/minimax-m2.7
---

## Goal

Clean up recently changed code without changing how the software works or behaves.

## Workflow

1. **Scope** — Run `git diff` to identify what changed. Only touch changed files and functions.
2. **Refactor** — Inline helpers, flatten control flow, remove dead code, simplify abstractions.
3. **Fix** — Run the fix.
4. **Verify** — Run the lint, then the type-check.
5. **Repeat** — Repeat steps 2 to 4 until both verification steps pass.
6. **Complete** — Report what changed and validation result.

## Rules

- ONLY refactor code that appears in the git diff
- NEVER change how the software works or behaves
- NEVER change exported interfaces, function signatures, or public API
- NEVER add new abstractions — only remove or inline existing ones
- Persist until both verification steps pass
- DO NOT ask questions — pick defaults and continue
```

### 4. AGENTS.md (trimmed)

```markdown
# AGENTS.md

**CRITICAL**: Follow exactly unless user overrides.

## Output

- ONLY bullet points and code blocks — NEVER prose
- Code: ```typescript with complete signatures
- ASCII diagrams only for relationships

## Code Style

- NEVER annotate types or return types — trust inference
- NEVER use `as` — if inference fails, redesign
- Prefer inlining over extraction — don't create helpers unless user asks
- Happy path only — no guards, no re-validation
- Biome or TypeScript error = wrong design → rewrite

## MVP Mindset

- Implement ONLY what's explicitly asked for — nothing implied, nothing extra
- DO NOT add features, utilities, or abstractions beyond what's needed
- DO NOT plan ahead for future requirements
- Keep implementation as simple as possible
- NEVER preserve backward compatibility unless explicitly asked
- Treat the project as greenfield — breaking changes are fine

## Scripts

- `bun run fix` — auto-fix linting and formatting errors
- `bun run lint` — static analysis without modifying code
- `bun run type-check` — type-check and future tests

## Skills and Research

- Read source files skills point to for exact signatures
- `.opencode/resources/` = source of truth for external packages
- NEVER rely on training data for external packages
- NEVER research in `node_modules`

## Imports

- Package-local: `#lib/*`
- Cross-package: `@ai-toolkit/{packageName}/{optionalExportPath}`
- Read `@ai-toolkit/*` from workspace source, not `.opencode/resources/`
```

### 5. Skill trimming

Apply to all 8 existing skills:

- **Remove `metadata.patterns`** from frontmatter — description is sufficient for skill selection
- **Merge "Patterns" and "Rules"** into one "Patterns" section
- **Keep source files** — essential for agent to read exact signatures
- **Keep examples** — most effective teaching tool, but remove `// Bad` labels when the good example makes it obvious
- **Update self-improve** — reference orchestrator workflow phases instead of agent names

### 6. Files summary

| Action | Path |
|--------|------|
| Delete | `.opencode/agents/development.md` |
| Delete | `.opencode/agents/plan.md` |
| Delete | `.opencode/agents/build.md` |
| Create | `.opencode/agents/orchestrator.md` |
| Create | `.opencode/agents/implement.md` |
| Create | `.opencode/agents/cleanup.md` |
| Modify | `.opencode/opencode.json` |
| Modify | `AGENTS.md` |
| Modify | `package.json` |
| Modify | `turbo.json` |
| Modify | `apps/*/package.json` |
| Modify | `packages/*/package.json` |
| Modify | `.opencode/skills/*/SKILL.md` (all 8, trimming) |

## Decisions

- **Orchestrator thinks in user terms** — it understands intent, behavior, and feel, then distills that into a short brief for `implement`
- **Custom subagents over built-in `general`** — each subagent runs its own model (GPT 5.4 for implementation, minimax-m2.7 for cleanup)
- **Iterative implement loop before cleanup** — user tries the feature, gives high-level feedback, and keeps iterating until behavior feels right
- **Orchestrator never runs scripts** — verbose validation belongs in subagents, not the expensive Opus context
- **MVP is the default** — if the user did not ask for it, it should not be implemented
- **Split scripts by concern** — `type-check` handles type-checking, `lint` handles static analysis, `fix` handles autofixes
- **No backward compatibility by default** — configuration can break old behavior when the new workflow is clearer
- **Cleanup is diff-scoped** — start from `git diff`, only polish changed code, and never change behavior
- **Cleanup runs after satisfaction and can repeat** — behavior first, code quality second, with at least two cleanup passes for polish
- **Cleanup MUST NOT change exported interfaces** — only internal simplification, prevents cascading breakage
- **Question tool only for understanding and iteration** — once cleanup begins, the workflow becomes autonomous until final report
- **Self-improve is a final optional phase** — only use it when cleanup reveals a systemic problem that should be fixed at the source
