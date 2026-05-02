# Worktree Thread Navigation And Sync Plan

## Objective

Build the agent app around two fast navigation loops:

- **Thread switching** across all repos with `Ctrl+P`
- **Worktree view switching** inside the current worktree with `Ctrl+1` / `Ctrl+2`

Use an opencode-style sync engine so backend state changes stream into frontend atoms in real time.

Keep workspaces as grouping only.

Make worktrees and threads the primary operational concepts.

## Product Model

### Concepts

| Concept | Role | Navigation Weight |
| --- | --- | --- |
| Workspace | Grouping boundary | Low |
| Repo | Group label and ownership boundary | Medium |
| Worktree | Active code context | High |
| Thread | Active agent conversation/task | Highest |
| View | Worktree-scoped surface | High |

### Thread Lifecycle

- Threads are created only after the first prompt is sent.
- Opening the compose UI must not create a persisted backend thread.
- Empty/dead threads should not exist.
- Threads are archived, not deleted.
- Archived threads are hidden from normal navigation and sidebar UI.
- Archived threads remain available for future cost tracking and analysis.

### Worktree Lifecycle

- Creating a worktree immediately switches to it.
- The created worktree appears in synced frontend state immediately.
- Deleting a worktree is destructive and requires confirmation.
- Deleting a worktree is scoped to the current worktree.

## Keyboard Model

### `Ctrl+P`: Thread Switcher

Purpose:

- Switch between active threads across all repos.

Behavior:

- Shows all non-archived threads across all repos.
- Groups rows by repo.
- Sorts threads by `lastActivityAt`, newest first.
- Does not pin the current thread first.
- Subtly marks the active thread if visible.
- Selecting a row opens the thread view.
- Selecting a thread with no prompt should not be possible because such threads are not persisted.

Row layout:

| Position | Content |
| --- | --- |
| Main label | Thread title |
| Fallback label | First prompt preview or `Generating title...` |
| Right side | Worktree name only |
| Badge | Thread state when useful |

Thread states shown:

- `working`
- `awaitingApproval`
- `failed`
- `idle`

`idle` can be visually quiet.

`awaitingApproval`, `working`, and `failed` should be easy to scan.

### `Ctrl+Shift+P`: Command Palette

Purpose:

- Run scoped actions.

Actions:

- Create worktree
- Create thread/compose first prompt
- Delete current worktree
- Toggle/open current diff if useful

Right-side labels:

- Show the scoped reference name.
- Use repo/worktree/thread names.
- Do not show full paths.
- Do not show generic hints like `current project` or `current worktree`.

Thread archive should not be primarily exposed here.

Thread cleanup is a sidebar/tree operation.

### `Ctrl+1` / `Ctrl+2`: Worktree View Tabs

Purpose:

- Switch views inside the current worktree.

Initial tabs:

| Shortcut | View |
| --- | --- |
| `Ctrl+1` | Thread |
| `Ctrl+2` | Diff |

Rules:

- Replace the existing workspace/project `Ctrl+number` behavior.
- Show tab numbers visibly at all times.
- Do not add future tabs yet.
- Keep order stable.
- Switching to `Thread` returns to the last selected thread for the current worktree.
- `Ctrl+P` selecting a thread updates the current worktree, selected thread, and selected view to `Thread`.

Future possible views:

- Traces
- Browser
- Terminal

Do not reserve UI slots for future views yet.

## Sidebar / Tree Model

Purpose:

- Provide visual context and batch cleanup.

Structure:

- Repo/workspace grouping
- Worktrees under repos
- Threads under worktrees

Thread actions:

- Archive icon on thread rows.
- Archiving hides the thread from normal UI.
- Archiving the current thread selects the next recent active thread.
- If no active thread remains in that worktree, select the next recent active thread globally.
- Avoid confirmation for archiving threads unless UX testing shows frequent accidents.

Worktree actions:

- Delete current/selected worktree with confirmation.
- Prefer confirmation for filesystem/git destructive operations.

## Metadata Model

### Thread Metadata

Thread navigation requires backend-synced metadata:

```ts
type ThreadMetadata = {
  threadId: string
  repoRoot: string
  worktreeRoot: string
  worktreeName: string
  agentRuntime: string
  title: string | undefined
  firstPromptPreview: string | undefined
  lastActivityAt: Date
  state: ThreadState
  archived: boolean
}
```

Thread state:

```ts
type ThreadState = 'idle' | 'working' | 'awaitingApproval' | 'failed'
```

Notes:

- `archived` belongs to application persistence, not the AI runtime concept.
- Runtime state belongs to the agent/thread runtime.
- Keep lifecycle and runtime state separate.

### `lastActivityAt`

Use `lastActivityAt`, not `updatedAt`.

Meaning:

- Navigation recency timestamp.
- Updated by user-visible or agent-visible activity.
- Updated when user sends a prompt.
- Updated when agent produces meaningful output.
- Updated when state changes to important states like `awaitingApproval`, `working`, or `failed`.
- Not updated by incidental metadata writes.
- Not updated by archival.
- Not updated by analytics recalculation.

### Title Fallback

Preferred order:

1. Generated title
2. First prompt preview
3. `Generating title...`

Avoid blank rows.

Avoid runtime-only labels when possible.

## Sync Engine Direction

### Inspiration From opencode

Reference files in cloned source:

- `.opencode/resources/opencode/packages/opencode/src/sync/index.ts`
- `.opencode/resources/opencode/packages/opencode/src/sync/event.sql.ts`
- `.opencode/resources/opencode/packages/opencode/src/sync/schema.ts`
- `.opencode/resources/opencode/packages/opencode/src/bus/index.ts`
- `.opencode/resources/opencode/packages/opencode/src/bus/bus-event.ts`
- `.opencode/resources/opencode/packages/opencode/src/bus/global.ts`
- `.opencode/resources/opencode/packages/opencode/src/session/session.ts`
- `.opencode/resources/opencode/packages/opencode/src/session/message-v2.ts`
- `.opencode/resources/opencode/packages/opencode/src/session/status.ts`
- `.opencode/resources/opencode/packages/opencode/src/session/projectors.ts`
- `.opencode/resources/opencode/packages/opencode/src/server/projectors.ts`
- `.opencode/resources/opencode/packages/opencode/src/server/routes/instance/event.ts`
- `.opencode/resources/opencode/packages/app/src/context/global-sync.tsx`
- `.opencode/resources/opencode/packages/app/src/context/global-sync/event-reducer.ts`
- `.opencode/resources/opencode/packages/app/src/context/global-sync/child-store.ts`
- `.opencode/resources/opencode/packages/app/src/context/sync.tsx`

opencode pattern:

```text
domain action
→ append-only sync event
→ per-aggregate sequence enforcement
→ projector updates read model
→ bus/global bus fanout
→ SSE event stream
→ frontend reducer updates normalized store
```

Key ideas to copy conceptually:

- Append committed domain events.
- Use projectors for backend read models.
- Stream events to clients.
- Let frontend reduce events into normalized state.
- Keep transient deltas separate from committed state.
- Support replay/reconnect by event sequence.

Do not copy transport directly.

This repo should keep:

- Effect RPC for commands and subscriptions.
- Effect Atom for frontend projections.

### Proposed Sync Architecture

```text
Effect RPC command
→ domain service
→ append sync event
→ projector updates backend read model
→ publish event envelope
→ Effect RPC subscription stream
→ frontend event reducer
→ Effect Atom state updates
→ derived UI lists/routes render
```

### Event Envelope

Every committed event should include:

```ts
type SyncEnvelope<TPayload> = {
  id: string
  type: string
  version: number
  aggregate: string
  aggregateId: string
  seq: number
  timestamp: Date
  payload: TPayload
}
```

Requirements:

- `seq` is per aggregate.
- Events for one aggregate must replay in order.
- Client can reconnect and request events after a known sequence/checkpoint.
- Event versions allow schema migration.

### Backend Collections To Sync

Initial synced collections:

- Repos/projects
- Worktrees
- Threads
- Thread statuses
- Active selection if backend-owned

Derived frontend state:

- Active thread list
- Threads grouped by repo
- Threads grouped by worktree
- Last selected thread per worktree
- Current worktree view

### Event Types

Initial event families:

```text
repo.updated
worktree.created
worktree.updated
worktree.deleted
thread.created
thread.updated
thread.archived
thread.title.updated
thread.activity.updated
thread.state.updated
selection.updated
```

Consider combining small updates into `thread.updated` if the payload is full enough.

Prefer full row payloads for UI reducers when practical.

Small patch events are harder to reason about and easier to desync.

### Transient Events

Keep transient streaming separate from committed sync events.

Examples:

- token deltas
- progress heartbeats
- temporary logs

These can stream to the active thread view without polluting navigation state.

Committed events should update durable UI state:

- title
- last activity
- state
- archived flag
- worktree existence

### Frontend Atom Shape

Use atoms as projections over the sync stream.

Suggested normalized state:

```ts
type SyncState = {
  reposByRoot: Record<string, RepoEntry>
  worktreesByRoot: Record<string, WorktreeEntry>
  threadsById: Record<string, ThreadMetadata>
  threadIdsByRepoRoot: Record<string, Array<string>>
  threadIdsByWorktreeRoot: Record<string, Array<string>>
  lastSelectedThreadIdByWorktreeRoot: Record<string, string>
}
```

Derived atoms:

- active non-archived threads
- `Ctrl+P` grouped rows
- sidebar tree
- current repo
- current worktree
- current thread
- current worktree view

## Routing / Selection

Selection needs to represent:

- repo/workspace grouping
- worktree
- thread
- worktree view

Minimum route/search state:

```ts
type HomeSearch = {
  projectRoot?: string
  worktreeRoot?: string
  threadId?: string
  view?: 'thread' | 'diff'
}
```

Rules:

- `Ctrl+P` selecting a thread sets `threadId`, `worktreeRoot`, `projectRoot`, and `view: 'thread'`.
- `Ctrl+1` sets `view: 'thread'`.
- `Ctrl+2` sets `view: 'diff'`.
- Creating a worktree sets active worktree immediately.
- Creating/starting a thread sets active thread after first prompt creates it.
- Archiving the current thread selects the next recent active thread.

## Diff View

Diff is scoped to the current worktree.

Initial behavior:

- Visible as tab `2 Diff`.
- Opened by `Ctrl+2`.
- Does not replace thread selection.
- Returning to `Thread` restores the remembered thread for that worktree.

Do not add per-row diff buttons in `Ctrl+P` initially.

Reason:

- `Ctrl+P` should stay a fast thread switcher.
- Per-row buttons make keyboard behavior ambiguous.
- Diff is a worktree view, not a thread switch target.

## Command Palette Details

### Create Worktree

Behavior:

- User enters/selects branch/worktree name.
- Backend creates worktree from the repo default branch or selected branch behavior already supported.
- Backend emits `worktree.created`.
- Frontend switches to the new worktree immediately.
- New worktree appears in future create menus immediately because state is synced.

### Create Thread

Behavior:

- Opens compose/agent runtime selection.
- Does not persist a thread until first prompt is sent.
- On first prompt:
  - backend creates thread
  - emits `thread.created`
  - starts agent
  - emits state/activity/title updates as available

### Delete Worktree

Behavior:

- Scoped to current worktree.
- Requires confirmation.
- Backend deletes/removes worktree.
- Backend emits `worktree.deleted`.
- Frontend selects next sensible worktree/thread.

Selection fallback:

1. Next recent active thread in same repo
2. Next recent active thread globally
3. Empty state

## Sidebar Cleanup Details

### Archive Thread

Behavior:

- Thread row has archive icon.
- Archiving is fast and suitable for batch cleanup.
- Backend emits `thread.archived` or `thread.updated` with `archived: true`.
- Frontend removes it from normal tree and `Ctrl+P`.

If current thread is archived:

1. Select next recent active thread in same worktree.
2. Else select next recent active thread in same repo.
3. Else select next recent active thread globally.
4. Else show empty state.

Archived threads remain in backend storage for future cost tracking.

## Open Questions / Risks

### Browser Shortcut Conflicts

`Ctrl+1` and `Ctrl+2` may conflict with browser tab switching.

If the app runs in a browser and cannot reliably capture these, use a different shortcut family later.

For now, keep the product decision: numeric shortcuts target worktree views, not workspaces.

### Title Timing

Generated titles are not immediately available.

Mitigation:

- Use first prompt preview immediately.
- Replace with generated title when event arrives.
- Show `Generating title...` only when no preview exists.

### Sync Complexity

Full append-only event sourcing is powerful but can overgrow the app.

Mitigation:

- Start with a small sync event registry.
- Use full-row payloads where possible.
- Add replay/checkpoint support early.
- Keep transient token streaming separate.

### State Ownership

Do not let frontend-only atoms become the source of truth for synced collections.

Backend owns synced data.

Frontend atoms project backend events.

## Success Criteria

- `Ctrl+P` switches threads across all repos.
- `Ctrl+P` rows are grouped by repo and sorted by `lastActivityAt`.
- `Ctrl+P` row right side shows only the worktree name.
- Current thread is subtly indicated but not pinned first.
- `Ctrl+1` opens the current worktree thread view.
- `Ctrl+2` opens the current worktree diff view.
- Existing workspace/project `Ctrl+number` switching is removed.
- Creating a worktree switches to it immediately.
- Reopening create menus sees the newly created worktree from synced state.
- Threads are not persisted until first prompt.
- Thread title, `lastActivityAt`, and state update through backend sync events.
- Sidebar can archive threads for batch cleanup.
- Archived threads disappear from normal navigation but remain persisted.
- Worktree deletion requires confirmation.
- Frontend state updates through Effect RPC subscriptions and Effect Atom projections.

## Implementation Order

Implement everything as one cohesive change, but keep internal phases clear:

1. Define synced backend data model and event envelopes.
2. Add Effect RPC subscription stream for sync events.
3. Add frontend sync reducer/atoms.
4. Add thread metadata fields: title, first prompt preview, `lastActivityAt`, state, archived.
5. Change thread creation so persistence happens on first prompt.
6. Rebuild `Ctrl+P` as all-repo thread switcher.
7. Add worktree view tabs and `Ctrl+1` / `Ctrl+2`.
8. Add diff view as worktree-scoped tab.
9. Add sidebar archive controls for threads.
10. Add confirmed current-worktree delete action.
11. Remove workspace/project `Ctrl+number` behavior.
12. Verify navigation, creation, archiving, and deletion flows end-to-end.
