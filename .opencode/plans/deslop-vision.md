# AI Toolkit — Personal IDE for AI-Assisted Development

Single-user, local-only web UI served by a Bun CLI. Eventual desktop wrap.

## Real Problem

Three pains, equally weighted:

1. **Parallel-worktree context switching drains energy.** Multiple projects × multiple branches × multiple tools (editor, agent CLI, browser, git client) → constant tab/window/repo switching. The work itself is fast; the switching is slow.
2. **Reviewing AI-generated code is slow and lazy.** Diff alone shows what changed but not the final shape; opening files in tabs breaks navigation. Structural code-quality issues (over-engineering, weird signatures, unnecessary helpers, defensive code) aren't catchable by linters and require human attention. Current tools force tab-hopping → reviews become incomplete.
3. **Tooling friction kills discipline.** The right loop (plan → implement → validate → refactor → review → commit) is what you want, but writing prompts manually + agents breaking loops early + no enforcement makes you settle for "good enough" instead of "perfect".

These three converge on one product principle: **eliminate friction in the AI-assisted development loop, so discipline becomes the path of least resistance.**

## Product Principle

**Workflows are the spine.** Every interaction with an agent runs inside a workflow. The workflow handles all determinism (validation runs, loop control, branching, compaction, retries, gates). The agent's prompt shrinks to the creative task only. Free-form chat is a degenerate workflow — not a separate mode.

This shifts the problem from "build a better agent UI" to "build a workflow runtime that makes high-quality output the default."

## Core Concepts

### Project → Worktree → Workflow Run

- **Project:** one git repo + hard-coded TS config (scripts, worktree templates) in this monorepo. No per-project customization at runtime.
- **Worktree:** the working unit. Short-lived (one per ticket, 2–5 active at a time). All work happens inside a worktree.
- **Workflow Run:** a durable, server-side execution of a workflow inside a worktree. Multiple runs can be concurrent across worktrees.

### Worktree Switching

- All worktrees pre-warmed on app startup: file watchers, diff cache, last layout, active workflow runs all kept hot.
- Switch is instant — UI swaps the active worktree key, no loading.
- Stale worktrees deleted manually via button. Branch in remote stays as backup.

### Workflows (the spine)

- **Plain TypeScript + Effect.** No DSL. Workflows are `Effect.gen` functions calling helper primitives.
- **Event-log driven runtime.** Each step emits typed events to a durable log (`step-started`, `awaiting-input`, `validation-passed`, `compacted`, `step-completed`). The event log is the source of truth for:
  - Persistence (resume after backend restart)
  - Visualization (mermaid graph derived from events)
  - Audit (every run kept forever for analysis)
  - UI synchronization (frontend rebuilds state by replaying events on connect)
- **Backend-owned execution.** Frontend triggers runs and approves gates; runs continue regardless of frontend connection.
- **Helper primitives** (the only abstraction):
  - `step(name, body)` — wraps a region as a named step, emits start/end events
  - `agent(config, instructions)` — runs an agent over a conversation, returns final state + history
  - `validate(command)` — runs a shell command, captures output, fails workflow if non-zero exit
  - `compact(history, intent)` — directed compaction, returns clean summary message
  - `awaitApproval(payload)` — pauses, persists, resumes when frontend approves
  - `awaitInput(schema)` — pauses for typed user input
  - `loop(condition, body)` — engine-controlled loop, agent cannot break early
- **No conditional/parallel primitives in MVP** — TS `if` and `Effect.all` cover those when needed.

### Compaction (between agents, not within chat)

The key insight: **don't transfer history between agents — transfer compacted intent.**

- Each agent uses its native SDK history during its own run.
- When a workflow transitions to a different agent, a compaction step extracts the essential information from the previous agent's history into a single seed message for the next agent.
- Compaction is a workflow node, written explicitly (`yield* compact(history, intent)`).
- Result: short, focused prompts; no noise carried across boundaries; no lossy history serialization.
- User-triggered compaction also exists (action bar) for free-form chats that grow noisy.

### Conversation History

- **Linear within a workflow step.** A step's conversation is what its agent sees. No fork/merge inside a step.
- **Revert to any message** (user or assistant): truncate, restart from there. Primary editing action.
- **Across-step continuity** is the compacted seed message, not history transfer.
- **Tree storage deferred** (post-MVP). Linear + revert covers 95% of use cases.

### Agent Abstraction

- **Stream-parts unified format** across backends.
- **Standard input:** messages + tools + system prompt.
- **Standard output:** stream of typed parts (text, reasoning, tool-call, tool-result, finish, metadata, usage).
- **MVP adapters:** Custom (Effect AI, used for non-coding/general tasks) + OpenCode.
- **Deferred adapters:** Claude Code, Codex.
- **App owns:** prompts, system instructions, slash commands, attachments, cost tracking, model selection.
- **Agent owns:** tool implementations, native permission/sandbox config (manual per-agent, e.g. `--dangerously-skip-permissions`).
- **Tool schemas standardized** (read/write/edit/bash have ~same signatures across agents); implementations remain agent-native.

### Workflow Visualization

- Built **automatically from the event log**. No separate viz file. No DSL annotations beyond the `step(name, ...)` calls already required at runtime.
- Mermaid diagram per workflow run + per workflow definition (template).
- Trade-off accepted: if you forget to wrap a region in `step()`, it doesn't appear in the diagram. Acceptable since you author all workflows.

### Background Triggers

- Scheduled workflows (cron-like): defined alongside regular workflows, run automatically.
- Use case: nightly research on tickets, automated PR review on push, etc.
- Notifications surface in a global panel.
- Webhooks deferred.

## Review Workflow (the second-biggest pain)

Detailed because it's the daily bottleneck.

### Diff/file presentation

- **Diff and final-file are the same view, toggled by hotkey** (preserves cursor position so navigation never resets).
- **Stacked diffs** as the diff style (your current preference).
- **Diff scopes:**
  - HEAD → unstaged
  - Staged → unstaged
  - HEAD → staged
  - Branch base → current (PR review)
- **Changed-files tree** with status indicators, jump to next/prev change.
- Virtualized rendering (pierre-diffs is already integrated).

### Review process (workflow-driven)

1. **AI pre-review pass (ralph loop).** A review-agent runs multiple passes over the diff, flagging structural issues (interfaces, over-engineering, single-use helpers, defensive code, signature smell). Each pass deepens the critique.
2. **Inline AI comments** appear on the diff/file alongside hunks.
3. **Human review.** You read the AI comments + the diff/file, accept/dismiss/extend each AI comment, add your own comments where needed.
4. **Send to refactor agent.** All accepted + human comments are packaged with file/line context and sent as a structured prompt to a refactor-agent (workflow step).
5. **Loop until satisfied.** Refactor agent makes changes, AI re-reviews, you re-annotate, repeat. Engine-controlled loop.

### Comments as input references

- Comments accumulate in an inbox panel.
- Referenceable from the prompt input via autocomplete tokens (mentions an existing comment by id; expands to file path + line range + comment text on send).
- "Send all comments" action in the action bar packages everything for the agent.

## Prompt Input

- Built on existing Lexical editor.
- **Features:**
  - Mention/file token autocomplete (current)
  - Rich markdown formatting (bold, italic, headings, lists, links)
  - Code blocks with shiki highlight
  - Sections / collapsible headings
  - Slash command menu (for in-prompt commands only — app-level operations live in the action bar)
  - Image + file attachments (drag-drop, paste)
  - Comment references (autocomplete)
- **Excalidraw block** above the input (deferred, not MVP — keeps idea on file).

### Action Bar (under the input)

Replaces slash commands for app-level operations. Buttons + assignable hotkeys.

- **Prompt improver** — AI rewrites your draft for clarity/precision; you accept/edit before send.
- **Compact** — directed compaction of current conversation with optional intent string.
- **Stash / pop** — git-stash style for prompt drafts.
- **Queue** — send when current task finishes.
- **Steer** — inject mid-stream into running agent.
- **Send comments** — package pending review comments and send.
- **Switch agent** / **Switch model** — for the next send.
- **Revert to message** — truncate to selected message and continue.
- **Attach drawing** (deferred) / **Attach file**.

Initial scope: all as buttons. Promote to dedicated hotkeys based on actual usage.

## Git

### Operations

- **Manual:** branch, commit, amend, push, fetch, pull, rebase, merge, cherry-pick, force-push-with-lease.
- **AI-assisted:**
  - Commit message generation from staged diff
  - PR description generation from branch diff
  - Conflict resolution (hunk-by-hunk AI proposals)

### Worktree creation

- Pick base: existing local branch / existing remote branch / new branch from base.
- Optional template (per-project, hard-coded TS): files to copy from main worktree, setup commands to run after creation.
- AI naming optional, not blocking.

## Static Code Analysis

- **App-owned Biome config + custom plugin pack** (extends `packages/linter`).
- App runs lint against its own config inside any worktree, never writes config into the user's repo.
- **Surfaces:**
  - Lint output panel during review
  - Workflow validation step (`validate('biome check')`) — gates progression

## Layout System

### Slot-based shell with named presets

- **Plan** — workflow graph + conversation + rendered plan markdown
- **Develop** — changed files tree + browser preview + chat input + comments inbox
- **Review/Refactor** — changed files tree + diff/file viewer (hotkey toggle) + comments inbox + chat input

### Workflow-driven layout switching

- Each workflow step declares preferred preset.
- Engine swaps preset on step entry.
- User can override and re-save.
- **Cross-worktree notifications** for pending gates: if a workflow in another worktree needs your input, badge in worktree sidebar; click jumps to it.

### Composable UI blocks

Defined in `packages/components`, reused across presets. Catalog finalized as the components are built; not locked here.

## Persistence

Everything persists across restarts:

- Projects, worktrees, layout presets
- Workflow definitions + every run + full event log + final state (forever, for later analysis)
- Conversation histories (per workflow run, per agent step)
- Pending review comments
- Cost / usage history
- Prompt drafts (including stashed)
- User preferences, hotkeys, theme

Storage: Effect KeyValueStore on filesystem, app data dir (`~/.deslop/`).

## Performance

Non-negotiable. Target: feels like Linear / Zed / t3-code.

- All worktrees pre-warmed in memory on startup
- Sub-100ms worktree switch (UI key swap, no I/O)
- Virtualized rendering: files, diffs, conversations
- Binary RPC (websocket + msgpack) — already in place
- Optimistic UI for all user actions
- Streaming render of agent output
- 60fps frame budget, profile regressions
- Worker offload for diff computation, syntax highlighting
- Local persistent cache to avoid recomputation across sessions

## Architecture

### Repo structure

- **Single app:** `apps/toolkit` (replaces `apps/agent`).
- All workflows, project configs, global instructions live in `apps/toolkit/src/{workflows,projects,instructions}/` as TS files.
- **Packages:**
  - `packages/ai` — agent abstraction (extend existing); add Claude Code + Codex adapters later
  - `packages/git` — extend with worktree mgmt, commits, branches, push/pull/merge, conflict APIs
  - `packages/workflow` — workflow primitives, event log, durable runtime
  - `packages/components` — composable UI blocks
  - `packages/linter` — extend with app-owned config runner
  - `packages/proxy` — dev-server proxy with react-grab injection (deferred)
  - `packages/terminal` — pty/xterm session manager (deferred)

### Workflow runtime

- Backend Effect fiber per active run.
- Every primitive emits events to the run's durable event log (Effect KV-backed).
- Frontend RPC stream: subscribes to event log, replays on reconnect.
- Approvals/inputs: backend persists `awaiting-*` state, resumes when frontend posts the response.
- Resume-from-restart: read latest event, hydrate fiber state, continue.

## MVP Scope

### Core (must-ship)

1. Worktree switching (sub-100ms, pre-warmed, parallel-friendly)
2. Workflow runtime + event log + mermaid viz from events
3. Workflow primitives: `step`, `agent`, `validate`, `compact`, `awaitApproval`, `awaitInput`, `loop`
4. Agent abstraction with **Custom + OpenCode** adapters
5. Review workflow: diff/file toggle, AI pre-review (ralph loop), inline comments, comments-as-references, send-to-refactor loop
6. Action bar: prompt improver, compact, stash/pop, queue, steer, send comments, switch agent/model, revert
7. Manual git ops + AI commit/PR/conflict
8. App-owned Biome runner + workflow validation step
9. Three layout presets, workflow-driven switching, cross-worktree notifications
10. Background triggers (scheduled workflows)
11. Persistence of everything

### Deferred (kept on file, not priority)

- Excalidraw inline drawing
- Embedded terminal (use OS terminal)
- Conversation tree (linear + revert is enough)
- Eval framework (post-workflows-prove-themselves)
- Integrated browser + react-grab proxy injection
- Multi-agent adapters: Claude Code, Codex
- Webhook triggers

### Out of scope

- Multi-user, sharing, sync
- Per-project committed config files
- Per-project runtime overrides (everything hard-coded in this repo)
- Visual workflow editor (TS code only)

## Open Questions

- **Workflow primitive ergonomics** — exact signatures of `step`, `agent`, `validate`, `compact`, `awaitApproval` decided when `packages/workflow` is implemented. The set listed here is the contract.
- **Mermaid generation from events** — how rich (just nodes? edges with conditions? loop indicators?). Decide when first workflow runs end-to-end.
- **Cross-agent slice replay fidelity** — deferred along with multi-agent adapters; compaction-as-handoff sidesteps the issue for now.
- **Action bar → hotkey promotion path** — buttons first, observe usage, promote to hotkeys. No upfront keybinding scheme.
- **Composable UI block catalog** — finalized when `packages/components` evolves; not locked in this plan.
