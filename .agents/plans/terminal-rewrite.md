# Terminal stack full rewrite: server-side emulator, snapshot attach, glitch-free live path — battle-tested

## Context

The workbench backend (node) leaks memory badly with multiple long-running terminals (vite dev servers, claude code / codex agents), and TUIs glitch on switch/resume **and sometimes while connected**. This is a full rewrite of the terminal pipeline (backend service + frontend attachment), not an incremental patch. Root causes, all verified in code:

**Memory (backend node process):**

1. Raw-byte transcript (`packages/terminal/src/service.ts`, `transcriptRef.frames`) trimmed by newline count — claude/codex repaint with cursor moves and emit almost no `\n`, so the trim never fires → unbounded growth. The uncommitted 16MB cap bounds it but still costs ~32MB heap/terminal.
2. `publishFrame` recopies the whole immutable frames array + walks `retainTranscript` on **every chunk** → constant O(n) copies, GC churn (reads as both leak and lag).

**Switch/resume glitches:** 3. Attach replays up to 16MB of escape-dense redraw history (seconds of lag); live frames overflow the 1024 attach queue during slow replay → server kills the attachment (`service.ts:147-153`) with no client recovery. 4. Replay at wrong width (frontend skips resize frames `-workbench-terminal.tsx:77`; PTY defaults 120×32), trim slices frames mid-escape-sequence (`service.ts:79`), replay reproduces intermediate repaints.

**Live glitches while connected (mostly complex TUIs):** 5. `processedFrameRef` in `-workbench-terminal.tsx` stores only the _single last completed_ frame key. When `useAtomSubscribe` re-fires with an overlapping items batch (re-render / waiting toggle while async xterm writes are in flight), already-written frames get **re-written into xterm** — duplicated escape bytes mid-repaint. Complex TUIs repaint constantly, so they hit this most. 6. `terminalChunks` (`model.ts:9-16`) slices at arbitrary char offsets → can split a surrogate pair; the lone surrogate then crosses the RPC/JSON boundary and becomes U+FFFD → corrupted stream (commit d73109e already fought this for snapshots).

**History:** commit `c8794c4` "fix: memory leaks" removed a previous `@xterm/headless` + serialize architecture. Its leaks were the unbounded queues + PubSub event log, **not** the emulator. This rewrite reinstates the emulator under the current bounded-queue discipline.

**Chosen direction (user-approved):** one headless xterm per session server-side; on attach, serialize screen+scrollback once and send as a snapshot, then stream live bytes. No raw-byte transcript, no replay. App-lifetime persistence (no tmux). User requirements: full rewrite, battle-tested, glitch-free for codex/claude-code TUIs, maximally Effect-native per AGENTS.md and the `effect` and `frontend` skills.

## Effect architecture (v4, per the configured Effect Git reference and skills)

Verified against the Effect source ref (not node_modules):

- **Service shape:** keep `Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {make})` + `Layer.effect`; multi-instance ownership stays in the app `RcMap` (handlers.ts) — no app/UI state in the package service. Public methods traced with `Effect.fn('Terminal.attach' | 'Terminal.resize' | 'Terminal.restart' | 'Terminal.stop' | 'Terminal.write')`; hot paths (writer loop, frame publish) `Effect.fnUntraced`.
- **xterm interop:** `Effect.callback<void>(resume => { screen.write(chunk, () => resume(Effect.void)) })` for parse completion (v4 replacement for `Effect.async`; resume takes an Effect, called exactly once). Runs only inside the single writer fiber, so no cancellation race on the write callback.
- **Single-writer fiber:** keep `Stream.fromQueue(dataQueue) → Stream.groupedWithin(128, 16ms) → Stream.runForEach → Effect.forkScoped`. All emulator writes + frame publication flow through this one fiber; `screenLock = yield* Semaphore.make(1)` is shared with `attach`/`resizeLocked`/respawn so snapshot consistency is a lock invariant, not a convention.
- **State:** `Ref` for `attachedRef: readonly AttachQueue[]`, `sizeRef`, `oscRef`, and the frame `sequence` counter (`Ref.modify` for allocate-and-increment; all mutations already serialized under `screenLock`). `SubscriptionRef` stays for `status` (held synchronized state → frontend `status.watch`). Keep the existing mutable-closure backpressure vars (`pendingBackpressure`, `backpressureDraining`) — synchronous hot path inside the PTY callback, per current idiom.
- **Queues:** attach queues stay `Queue.bounded<TerminalFrame, Cause.Done>(1024)`; `Queue.offerUnsafe` on the publish hot path with drop+`Queue.shutdown` for slow clients; `Stream.fromQueue` excludes `Done` from the client-visible error channel. No Mailbox in v4 — Queue covers it.
- **Stream lifecycle:** `attach` = `Stream.unwrap(Effect.gen(...))` returning `Stream.fromIterable(snapshotFrames)` concat `Stream.fromQueue(queue).pipe(Stream.ensuring(deregister + shutdown))`. `Stream.ensuring` fires on normal Done, failure, AND downstream interruption (RPC client disconnect) — the deregistration path needs no other mechanism.
- **Finalization (LIFO via `Effect.addFinalizer`):** stop process → shutdown dataQueue/resizeQueue → shutdown attach queues (existing), then `screen.dispose()` strictly last and sequential (writer fiber must already be unblocked, or a pending `Effect.callback` resume is lost).
- **Errors:** `TerminalError` remains the single service-owned tagged error (Schema tagged error class, optional cause/message); public methods expose only it. Fail loud — no fallback branches.
- **Schema:** frames stay a schema-owned tagged union (`type` discriminator); types inferred from schema, never the inverse.
- **Frontend reactivity:** `Atom.pull` result is `AsyncResult<{done: boolean, items: NonEmptyArray<TerminalFrame>}>`; with `disableAccumulation` each pull yields only the new batch, and stream end surfaces as `Failure` (`Cause.NoSuchElementError`) — the reattach trigger handles `Failure` plus defensively `value.done`. `Atom.family` is WeakRef+FinalizationRegistry-backed, so monotonic attachId keys are GC-safe. Components render, atoms own logic: the only component-side logic is the imperative xterm bridge (sequence-gated ordered writes). React Compiler is on — no `memo`/`useMemo`/`useCallback` anywhere in the new components.
- **Equality:** sequence gating compares numbers directly — delete the `epoch:sequence` string frame keys (skills: no custom string keys when structured comparison works).

## Changes

### 1. Dependencies — `packages/terminal/package.json`

Add `@xterm/headless` pinned to exactly `6.0.0` (must match `@xterm/xterm@6.0.0` used by packages/components, per pnpm-lock) and `@xterm/addon-serialize` (exact xterm-6-compatible release — **verify at `vp install` time; if only 5.x-compatible exists, stop and surface it**). No `@xterm/addon-progress` (OSC parsing stays in `model.ts`).

### 2. Schema — `packages/terminal/src/schema.ts`

Delete `TerminalCursor`. New frame shape:

```ts
TerminalFrame = {sequence: number, type: 'reset'} | {data: string, sequence: number, type: 'output'}
```

- Drop the `resize` frame type (server-side reflow makes it moot).
- Drop `epoch`; `sequence` is one monotonic counter for the service-instance lifetime (never resets, incl. respawns).
- `TerminalSize`/`TerminalInput`/`TerminalStatus`/`TerminalError` unchanged.

### 3. Model — `packages/terminal/src/model.ts`

Make `terminalChunks` surrogate-safe: if a chunk boundary lands between a high and low surrogate, move the boundary back one code unit. Add a unit test in `model.test.ts` (emoji straddling the boundary). `terminalOscUpdates` unchanged.

### 4. Service rewrite — `packages/terminal/src/service.ts`

**Delete:** `Transcript`, `transcriptRef`, `retainTranscript`, `framesAfterCursor`, `newlineCount`, `nextCursor`, scrollback constants, cursor param on `attach`.

**Keep (already-sound bounded machinery):** bounded `dataQueue(128)` + `pendingBackpressure` + pause/resume, `groupedWithin(128, 16ms)` writer fiber, `replayProcessRef` stale-output guard, resize sliding queue, lifecycle lock, status/title/progress pipeline, autostart/respawn, per-client `Queue.bounded(1024)` with drop+shutdown, finalizer.

**New state:**

```ts
const screen = new HeadlessModule.Terminal({allowProposedApi: true, cols: 120, rows: 32, scrollback: 20_000})
const serialize = new SerializeModule.SerializeAddon()
screen.loadAddon(serialize) // may need one localized cast for typings
const screenLock = yield * Semaphore.make(1)
const attachedRef = yield * Ref.make<readonly AttachQueue[]>([])
const sequenceRef = yield * Ref.make(0) // allocated via Ref.modify; all mutations under screenLock
```

**Consistency invariant — a chunk is in the snapshot XOR delivered live.** Writer fiber, per output item, under `screenLock`:

1. OSC parse → setTitle/setProgress
2. `Effect.callback(resume => screen.write(chunk, resume))` — **await the parse callback** (xterm parses async; serializing between `write()` and its callback would lose the chunk)
3. `sequence += 1`; `offerUnsafe` frame to every queue in `attachedRef`; drop+shutdown overflowed queues (same as current lines 147-154)

`attach(size?)`: under `screenLock` — optionally `resizeLocked(size)` first, `serialize.serialize({scrollback: 20_000})`, build `[{type:'reset'}, ...terminalChunks(snapshot) as output frames]` consuming sequences, register queue in `attachedRef` **inside the lock**, then `Stream.fromIterable(snapshot)` concat live queue with deregister+shutdown in `Stream.ensuring`.

Emulator backpressure: awaiting the screen.write callback slows the writer → dataQueue fills → existing pause/resume engages. No new mechanism.

**Respawn:** replace `resetTranscript()` with (under lock): `screen.reset()`, `sequence += 1`, publish `{type:'reset'}` to attached queues.

**Resize:** `resizeLocked(nextSize)` — compare `sizeRef`, then `screen.resize` + `pty.resize` together; resizeQueue consumer wraps in withPermit, attach calls it while already holding the permit. No frame published.

**Finalizer:** existing cleanup, then `screen.dispose()` sequentially last (writer fiber must be unblocked first).

**Mock layer:** `attach: (_size?) => Stream.fromIterable(input.frames ?? [])`.

### 5. RPC — `apps/workbench/src/rpcs/contracts.ts`, `handlers.ts`

- `terminal.attach` payload gains optional `cols`/`rows` (same pattern as `terminal.resize`; `TerminalPayload.make` strips extras — see resize handler handlers.ts:589-593).
- Handler passes size to `sessionTerminal.attach(...)` so every snapshot is taken at the client's real size (kills the stale-width "broken blocks" vector).

### 6. Frontend rewrite

**`apps/workbench/src/lib/state.ts`:** `TerminalAttachAtomKey` gains `size: {cols, rows}`; `terminalAttachQueueAtomFamily` sends cols/rows in the attach payload. `disableAccumulation` stays.

**`apps/workbench/src/routes/components/-workbench-terminal.tsx`:** rewrite as parent + per-attach child:

- Parent `WorkbenchTerminal`: owns the xterm `<Terminal>` (mounted immediately), write/resize mutations, status atom (keeps forcing RcMap autostart), and attach state `{id, size} | null`. First `onResize` triggers the first attach (fit fires within ~16-500ms) so snapshots are always client-sized. `reattach()` bumps attachId after ~300ms. Resets to null on sessionKey change. Renders `<TerminalAttachment key={sessionKey:attachId}>`.
- Child `TerminalAttachment` (renders null): owns `terminalFramePullAtom(session, attachId, size)` + subscribe loop. **Replace the pending/processed-Set logic with a strictly-ordered single-writer:** keep `lastSequenceRef`; per batch, take only frames with `sequence > lastSequenceRef`, in order; advance `lastSequenceRef` when _issuing_ each write (xterm preserves write-call order internally, so issue-order is render-order); merge consecutive output frames into one `write()` call; `reset` → `terminalRef.reset()`. Pull the next batch only after the last write's callback fires (flow control). This makes duplicate/out-of-order writes structurally impossible — fixes live-glitch cause #5.
- Reattach trigger: stream end surfaces as `Failure` (with `disableAccumulation`, graceful Done = `Cause.NoSuchElementError` — verified in effect's Atom.ts) → `onDone()` → parent reattaches with new attachId. Guard with mounted-check; 300ms delay prevents storms; snapshot makes reattach cheap and idempotent. Self-heals the slow-client drop (glitch cause #3).

**`packages/components/src/components/render/terminal.tsx`:** keep `scrollback: 20_000`; no functional change.

## Battle testing

### 6a. TUI torture fixture — `packages/terminal/src/fixtures/tui-torture.ts`

A standalone node script spawned inside the PTY by tests, emitting phased patterns that mimic claude code / codex rendering: plain scrolling output → ink-style repaint loops (cursor-up + erase-line redraws of a box-drawing "plan block") → DECSET 2026 synchronized-update blocks → alt-screen enter/exit (codex-style full-screen) → scroll regions (DECSTBM) → wide chars/emoji straddling chunk sizes → cursor save/restore + SGR storms. Phases are timed so tests can attach mid-phase. Each phase prints a sentinel marker.

Testing uses colocated Vitest through `vite-plus/test`, targets breakable behavior at public seams, prefers structural or asymptotic assertions over timing, and uses representative fixtures instead of invoking external Claude or Codex CLIs.

### 6b. Equivalence property tests — `packages/terminal/src/service.test.ts`

The core correctness oracle: **a client that attaches mid-stream (snapshot + live tail) must end with the same screen as a client attached from the start.** Helper: feed each client's frames into its own `@xterm/headless` instance; compare full buffer text (all rows incl. scrollback), cursor position, and active-buffer type. Run it attaching at multiple points inside every torture-fixture phase. Also:

- **No-gap/no-dup test:** fixture emits numbered lines in timed batches; attach mid-stream; extract numbers from snapshot+live concat → strictly increasing, contiguous.
- **Chunk-boundary fuzz:** drive `terminalChunks` + frame pipeline with randomized chunk sizes (1..64KB, seeded) over emoji/escape-dense data; assert equivalence holds for every split (catches surrogate/escape splitting regressions).
- **Restart:** live attachment receives `reset` then new output; sequences strictly increase across restart.
- **Snapshot at provided size:** `attach({cols: 40, rows: 10})` → snapshot reflects 40-col wrapping; PTY resized.
- **Slow-client drop:** attach a consumer that never pulls, emit > 1024 frames, assert queue is dropped+shutdown and other clients unaffected.
- Keep/adapt existing tests: mock layer, binary input, prepared-command cwd, 2MB burst delivery (replaces line-count restore tests — extract markers via regex; serialize emits `\r\n`).

### 6c. Memory/stress

- **Repaint-storm bound test:** run the repaint phase for ~10s (zero newlines, MBs of output); assert `serialize()` output stays bounded (~screen+scrollback, not stream length) — the architectural guarantee the old transcript lacked.
- Burst test: 50MB through a session with one attached + one slow client; no crash, writer fiber keeps up via pause/resume.

### 6d. Manual battle-test protocol (real agents)

1. Run the workbench; baseline backend RSS (`ps -o rss= -p <pid>`).
2. **claude code**: ask for a plan (bordered block). Switch away/back repeatedly (10×): block intact, correct width, snapshot paints <100ms, no staircase artifacts. Same with **codex** (alt-screen TUI).
3. **Connected-glitch soak:** stay attached to claude code through a long streaming response + plan rendering; watch for any corruption (this exercised causes #5/#6).
4. Resize while attached and while detached-then-reattach: blocks reflow (SIGWINCH repaint), snapshot at new width.
5. Menus/arrow keys/enter after reattach (catches serialize mode-restoration gaps — DECCKM, bracketed paste).
6. Output burst (`yes | head -c 50000000`) while attached: auto-reattach within ~1s if dropped.
7. Leave claude + codex + vite running 60 min; sample RSS per minute: must plateau.
8. Restart a session with two windows attached: both reset cleanly.

## Implementation order

1. package.json + `vp install` (gate: xterm-6-compatible addon-serialize must resolve)
2. schema.ts → model.ts (surrogate-safe chunks + test)
3. service.ts rewrite → torture fixture + service.test.ts rewrite → `vp run test`
4. contracts.ts/handlers.ts → state.ts → -workbench-terminal.tsx rewrite
5. `vp run check` + `vp run test`
6. Manual battle-test protocol (§6d)

## Risks

- **addon-serialize fidelity:** DECSTBM scroll regions not restored; partial mode restoration; DECSET 2026 snapshot may catch an intermediate paint (self-heals on next repaint); confirm alt-screen serialization on xterm 6. The equivalence tests (§6b) surface gaps early; mitigate residual gaps by accepting next-repaint self-heal for agent TUIs.
- **Version pinning:** headless must exactly match xterm 6.0.0; addon-serialize compat unverified offline — first gate.
- **CPU:** emulator parse is O(bytes); `serialize()` only on attach (~ms). Keep `screenLock` per-output-item — do not widen to whole batches (attach latency).
- **Atom failure semantics:** confirm transient socket reconnects don't surface spurious Failures → reattach storms (300ms delay + idempotent snapshot make this benign).

## Memory bounds after rewrite (per session)

- Headless buffer: lazily-allocated typed arrays; alt-screen TUIs (claude/codex — the leak case) ≈ ~50KB; log-heavy sessions ≈ ~30-38MB worst case at 20k full scrollback (drop to 10k if measurements demand). Zero per-chunk array churn.
- dataQueue 128 / attach queues 1024 (drop self-heals via reattach) / snapshot string transient.
