# Workbench Rewrite Plan

## Contract

This plan is repo-specific.

This file is the lazy-loaded implementation reference for the active Codex goal. Load it when working on the Workbench rewrite details, plus the relevant skills for the package or app slice being changed.

## Outcome

Rewrite the workbench around worktrees, terminal-native coding agents, portless previews, review, commit, and PR publishing.

## Scope

Core:

- `apps/workbench`
- `packages/ai`
- `packages/git`
- `packages/terminal`
- `packages/portless`
- `packages/components`
- `packages/opentelemetry`

Secondary:

- `apps/portfolio`: feature/UI unchanged, code cleanup only, no new packages/services.

Out of scope:

- Auth.
- Web-only deployment behavior.
- Durable storage for local comments.
- Durable storage for terminal scrollback.
- Custom web UI for coding agent SDK sessions.
- Compatibility layers for old workbench RPCs/routes/state.

## Reference Repos

Use configured OpenCode Git references only when external source answers the implementation question.

- `opencode`, `t3code`: multi-session coding-agent UX, terminal/session performance.
- `localterm`, `xterm-js`, `node-pty`, `lydell-node-pty`: terminal lifecycle, buffering, resize, attach.
- `portless`: preview/proxy behavior.
- `effect`, `effect-lsp`: Effect APIs, schemas, streams, layers, tracing.
- `pi`, `codex`, `opencode`: SDK/CLI agent command surfaces.

## Source-Guided Defaults

Prefer existing Effect and local/external repo primitives over custom machinery:

- Use `Context.Service`, `Layer`, and public `Effect.fn("Service.method")` methods for package services.
- Use app-owned `RcMap` for keyed multi-instance resources, with explicit invalidation for worktree, preview, terminal, and agent cleanup.
- Use `SubscriptionRef` for synchronized service state and `Stream`/`PubSub`/`Queue` for events, fan-out, buffering, and batching.
- Use Effect `FileSystem.watch`, injectable watch backends, `Path`, `Schedule`, `Resource`, `Scope`, and schema-derived equality before custom watchers, timers, refresh loops, path parsing, or dedupe logic.
- Use `ChildProcess.StandardCommand` as an external command value; command builders prepare commands, terminal services own process handles.
- Use schema classes/tagged errors for public data and service errors; keep external response schemas private.
- Add spans and annotations at package-service boundaries before tuning watcher or terminal performance.

## Package Targets

### `packages/ai`

Own:

- Generic SDK-agent wrapper.
- CLI coding-agent command catalog/builder.

Do not own:

- Terminal process lifecycle.
- Git/PR actions.
- Workbench sessions.
- Provider-specific public method names.

Public schemas:

- `AiError`
- `AgentStatus`
- `AgentPrompt`
- Agent provider/model/config schemas
- CLI agent command/config schemas

Target services:

- `Agent`
  - stable layer config: cwd, provider/model/config, system prompt, tools.
  - `status`: synced state.
  - `history`: computed/static conversation state.
  - one streaming prompt method. Use `prompt` unless Effect AI source suggests a better domain term.
  - no generate-text/generate-object split.
  - no Pi-specific public names.

- `AgentCommand`
  - maps static CLI agent configs plus cwd to `ChildProcess.StandardCommand`.
  - owns CLI coding-agent profiles used by Workbench.
  - variants are separate configs, not dynamic runtime mutation.
  - supports Codex, opencode, and Pi as terminal profile configs, not provider-specific service methods.
  - includes approval/sandbox/model/effort flags as static variant data.
  - no terminal/session ownership.

Primary use now:

- Generate commit messages.
- Generate PR title/body drafts.

The contract must support a later SDK-agent web UI without method or schema replacement.

### `packages/git`

Own:

- Git workspace discovery.
- Worktree lifecycle.
- Branch snapshots.
- Diff/review/comment state.
- GitHub PR/review thread integration.
- Commit/push/PR actions.

Do not own:

- AI text generation.
- Terminal process lifecycle.
- App session maps.

Private:

- Git command wrapper.
- Raw GitHub CLI/API response schemas.

Public schemas:

- `GitRepository`
- `GitProject`
- `GitWorktree`
- `GitWorktreeStatus`
- `GitBranch`
- `GitBranchesSnapshot`
- `GitDiff`
- `GitDiffSegment`
- `GitDiffStatus`
- `GitReviewTarget`
- `GitReviewState`
- `GitReviewMark`
- `GitReviewComment`
- `GitReviewMetadata`
- `GitCommit`
- `GitPullRequest`
- `GitHubReviewThread`

Target services:

- `GitWorkspace`
  - one home-level instance.
  - synced project/worktree state.
  - branch snapshots per repo/worktree.
  - create/delete/cleanup worktrees.
  - repo discovery under `$HOME`.
  - uses Effect filesystem/path APIs and injectable watch backends for tests.

- `GitReview`
  - one cwd-level instance.
  - metadata for the active worktree.
  - review groups/diffs.
  - synced review state.
  - mark/unmark reviewed.
  - save/resolve comments.
  - resolve local comments and GitHub review threads through the unified comment model.
  - local and GitHub comments exposed through one state shape.

- `GitPublish`
  - one cwd-level instance.
  - commit all current changes from the worktree.
  - push current branch.
  - read current PR.
  - create/update PR.
  - update PR title/body.

Discovery rules:

- Scan below the user home directory.
- Skip gitignored directories during repo discovery.
- Skip any directory path containing a segment that starts with `.` during repo discovery.
- After a main repo is found, discover all worktrees from Git, even when worktrees live under dot directories.
- React to external clones, worktree creation, branch changes, and file changes.
- Publish new state only when the structural value changed.

Worktree creation:

- Branch name is explicit.
- Existing branch can be selected only when not already attached to a worktree.
- Stable preview/session name derives from the branch/worktree name.
- Workbench-created worktrees use deterministic paths under `$HOME/.deslop/worktrees/<repo-slug>/<branch-slug>`.
- `<repo-slug>` is DNS/path-safe and collision-resistant for repositories with the same basename.
- Externally-created worktrees are still discovered from Git.
- Allowed branch prefixes: `feat/`, `fix/`, `refactor/`, `perf/`, `test/`, `docs/`, `chore/`.
- Branch suffix charset: lowercase letters, digits, `-`.
- No spaces.

Review behavior:

- No staged/unstaged split in UI or service state.
- Commit flow includes staged, unstaged, and untracked changes.
- Clicking a file marks its diff reviewed.
- A reviewed mark remains valid across commits when the diff fingerprint is identical.
- Preserve current review group semantics: changes group, branch/commit groups, no-whitespace diff mode.
- Local comments live in server memory only.
- GitHub comments are fetched from the current PR and normalized into the same comment model as local comments.

Publish behavior:

- Generate commit message in the app by composing `Agent` and `GitReview`/`GitPublish`.
- Show the generated message before committing.
- Approve action commits, pushes, and creates/updates a draft PR.
- PR title/body generation/update is a separate action.
- Opening the PR on GitHub is a separate action.

### `packages/terminal`

Own:

- One terminal process/session.
- Shell/TUI lifecycle.
- Scrollback in server memory.
- Attach/cursor replay behavior.
- Backpressure/batching.

Do not own:

- CLI agent config.
- Worktree ids.
- Multiple-session maps.
- UI route state.

Public schemas:

- `TerminalError`
- `TerminalStatus`
- `TerminalFrame`
- terminal cursor schemas
- terminal size/input schemas, including binary input for TUI mouse/key modes

Target service:

- `Terminal`
  - stable layer config: cwd, optional `ChildProcess.StandardCommand`.
  - `status`: synced state.
  - `attach`: frame stream from an optional cursor.
  - `write`, `resize`, `restart`, `stop`.

Requirements:

- Route switch/back must restore at least the latest 5,000 lines.
- Browser refresh must restore the live terminal session while the server/session lives.
- No sticky keys, input lag, or scroll/render stutter over large AI-agent histories.
- Use raw in-memory frame transcript with cursor replay.
- Status has one read path: `status`.
- `attach` emits terminal frames only.
- `TerminalFrame` is an ordered transcript frame union for output, resize, and reset/restart events.
- `TerminalCursor` is a transcript cursor, not a screen cursor. Use `{epoch, sequence}`; restart/reset advances the epoch.
- Resize is recorded in the same ordered transcript as output, not as a side channel.
- Expired cursors replay from the retained start; slow attach consumers should reconnect from cursor instead of blocking PTY ingestion forever.
- Browser xterm writes frames sequentially and advances cursor only after the `terminal.write(data, callback)` completion.
- Delete server-side headless xterm/serialize replay from the package implementation.
- Use bounded PTY ingest plus node-pty `pause`/`resume` high/low watermarks for backpressure.
- Terminal component props should match the exported frame/status shapes structurally, without direct package imports.
- Multiple workbench terminals are app-owned `RcMap` entries.

Workbench session model:

- One shell terminal per worktree.
- Multiple CLI coding-agent terminal sessions per worktree.
- One preview controller per worktree, with one or more service terminals/routes.

### `packages/portless`

Own:

- Preview/run schemas.
- Stable preview identity.
- Dynamic port/proxy helpers and route registry.
- One preview controller instance per cwd.

Do not own:

- Worktree discovery.
- Terminal rendering.
- Terminal process lifecycle.
- App route state.

Public schemas:

- preview script schema replacing app-local `RunScript`.
- preview run/origin/status schemas.

Requirements:

- One app/dev-server instance per worktree.
- Separated frontend/backend scripts may create multiple service terminals/routes under one preview controller.
- No frontend/backend port collisions across parallel worktrees.
- Stable preview identity derived from the worktree/branch identity.
- Support separated frontend/backend processes and websocket-native backends.
- No framework constraint that blocks native websocket/Effect entrypoints.
- Keep the injected browser bridge and unpkg debug scripts.
- Inject dynamic ports/env into prepared preview commands.
- Prefer `PORTLESS_URL` as the canonical app URL env; add Vite/Workbench-specific aliases only where needed.
- Use bind-based port allocation and avoid browser-blocked ports.
- Prepare framework-aware host/port flags for known dev servers; terminal executes the command.
- Use raw HTTP upgrade proxying for websocket routes so subprotocols and HMR behave like the upstream server.
- Include proxy loop detection.
- Remove a subdomain proxy route when the related service terminal closes.
- Replace proxy routes atomically when scripts change.

### `packages/components`

Own:

- Reusable side-effect-free UI primitives.
- Terminal React component.
- Shared formatting/toast helpers.

Do not own:

- App services.
- Worktree/session state.
- Package service imports.

Requirements:

- Terminal component contract matches `packages/terminal` exported data structurally.
- Error toast helper formats errors through the shared formatter.
- Owned SVG/icon assets do not live under `components/ui`.
- Portfolio UI stays visually unchanged.

### `packages/opentelemetry`

Own:

- Runtime tracing/logging layers.
- Browser/server integration helpers.
- Motel-compatible local debugging setup.

Requirements:

- Package service spans must be visible during workbench workflows.
- Use runtime evidence for performance/leak work before changing terminal or watcher internals.

## Workbench Composition

`apps/workbench` owns only composition:

- Route state.
- Atoms.
- RPC contracts/handlers.
- Session ids.
- `RcMap` instances.
- Cross-package orchestration.

URL state:

- Keep navigational state in the URL when it improves refresh/back/forward behavior.
- URL may store active surface, selected session id, selected origin id, selected commit hash.
- URL must not store command/env/cwd payloads when a stable id can derive them.

Suggested maps:

```txt
GitWorkspace        home
GitReview           cwd
GitPublish          cwd
Terminal            terminal session key
Portless            cwd
Agent               SDK agent config key
```

RPC contracts:

- Import schemas from packages.
- Do not define package-owned schemas locally.
- Return package service states/streams directly where possible.
- Handlers should be mostly `RcMap.get -> service method`.

Frontend state:

- Workbench routes read from atoms.
- Atoms own async UI composition.

## Workbench UX

First-class object:

```txt
worktree = repo + cwd + branch + task state
```

Primary screens:

- Project/worktree index.
- Worktree workspace.

Worktree workspace must keep these close together:

```txt
agents        terminal-native coding agents
preview       one live app instance
review        diffs, comments, reviewed marks
publish       generated commit, push, PR update
shell         normal cwd shell
```

Interaction contract:

- One visible path per action.
- Async action buttons show pending state.
- Recoverable action failures go through the shared error toast.
- UI remains dense, accessible, readable, and scan-first.

Git UI:

- Review and commit/publish are one workflow, not unrelated tabs.
- No stage/unstage view.
- Diff list optimized for reviewing AI-generated code.
- File click marks reviewed.
- Reviewed status survives unchanged diff fingerprints.
- GitHub and local comments share one visual model.
- Commit message input is replaced by generate/approve flow.
- Approve commits all changes, pushes the branch, and upserts a draft PR.

Agent UI:

- CLI/TUI coding agents are normal terminal sessions.
- No special TUI parsing.
- Agent configs come from `packages/ai`.
- Multiple agent sessions per worktree.

Preview UI:

- One preview per worktree.
- A preview may contain multiple service terminals/routes.
- Stable identity from branch/worktree.
- Manual testing should not require port selection.

## Implementation Passes

### 1. Interface pass

For each package:

- Rewrite public schemas.
- Rewrite service tags/interfaces.
- Delete duplicate schema mirrors after the owning package exports the canonical schema.
- Add mock layers.
- Add package tests for new service logic.
- Update exports.
- Make app compile against mocks if implementation is not ready.
- Remove public exports for private implementation helpers such as raw command wrappers or external response schemas.

Order:

1. `ai`
2. `terminal`
3. `git`
4. `portless`
5. `components`
6. `opentelemetry`

### 2. Package implementation pass

Implement packages behind the new interfaces.

Priority:

1. Terminal attach/cursor replay/backpressure.
2. Git discovery/realtime/review state.
3. GitHub PR/comment integration.
4. Portless preview controller/proxy identity.
5. AI prompt streaming and command builder.

### 3. Workbench rewrite pass

Replace current workbench RPC/state/routes in one coherent cut.

Targets:

- Delete app-local package schemas.
- Delete old RPC compatibility routes.
- Delete duplicate ways to run the same action.
- Move all per-cwd/per-session multiplicity into `RcMap`.
- Keep RPC handlers thin.
- Move frontend orchestration into atoms.
- Keep review/publish as one workflow.
- Keep URL-owned navigation state where it has refresh/back/forward value.

### 4. Performance pass

Measure before tuning.

Cases:

- Long coding-agent terminal session.
- Browser refresh with full scrollback restore.
- Route switch/back with at least 5,000 restored terminal lines.
- Multiple worktrees with active terminals.
- External repo/worktree creation detected by watcher.
- Large git diff review.
- Portless preview startup for parallel worktrees.
- Button pending/error states under slow actions.
- Keyboard navigation and focus state on core workflows.

Expected:

- No visible terminal stutter.
- No sticky keys or input lag.
- No unbounded queue growth.
- No duplicate frontend state emissions for equal values.
- No repeated Git/GitHub work when inputs did not change.
- One accessible, visible action path for each core command.

### 4.5 Cleanup pass

Run after each feature slice:

- Delete dead code from the replaced proof-of-concept path.
- Delete duplicate schemas/transforms.
- Improve names before adding more code on top.
- Re-scan for leaked package internals.
- Re-scan for UI duplicate action paths.

### 5. Portfolio pass

Simplify portfolio code after package/workbench rewrite.

Constraints:

- No feature changes.
- No UI changes.
- No package extraction for portfolio-only code.

### 6. Verification pass

Targeted checks beyond standard repo validation:

- focused package tests
- terminal performance tests
- git watcher/review tests with mocked filesystem/commands
- workbench smoke test through local app
- usability pass for loading, error, disabled, and focus states
- UI consistency pass for density, scanability, and duplicate actions

## Acceptance

The rewrite is done when:

- Workbench discovers repos/worktrees from the filesystem with near-realtime updates.
- Worktree creation enforces the branch naming contract.
- Workbench-created worktrees use deterministic paths.
- Each worktree can run multiple CLI agent terminals, one shell terminal, one preview, and one git workflow.
- Terminal route switch/back restores at least 5,000 lines.
- Terminal refresh restores the live in-memory session.
- Long terminal sessions remain stable with no input lag.
- Portless previews avoid collisions without manual port choice.
- Portless keeps preview injection and removes proxy routes for closed services.
- Review marks and comments behave correctly across commit changes.
- Commit flow is generate -> approve -> commit/push/upsert PR.
- PR title/body update is separate from commit approval.
- Portfolio behavior and visuals remain unchanged.
- Old workbench compatibility paths are gone.
- Package APIs are black-box usable through exported schemas/services/mocks.
