# Note RPC Handlers — Full Rewrite

## Goal

Rewrite `apps/note/src/rpcs/handlers.ts` from scratch. The current implementation is broken (references undefined `NotePart` type, overly complex `RcMap`/`Scope` wiring, convoluted sync logic). The new code must be simple, correct, and fully leverage Effect primitives.

The note app takes user input, runs an AI Agent per note, and stores the conversation history as it streams. The full notes list is synced to all connected clients in real-time. Multiple generations can run in parallel as background fibers that survive client disconnection.

## Interface

### Imports needed

From `@ai-toolkit/ai/service`: `Agent` (the `ServiceMap.Service` — call `Agent.make` to create a fresh instance per note)
From `@ai-toolkit/ai/utils`: `partsStreamReducer` (reduces a stream of parts into `Stream<Part[]>` via `Stream.scan` + `Stream.debounce`)
From `#rpcs/contracts.ts`: `Note`, `NoteId`, `NoteError`, `RpcContracts`
From `effect`: `Array`, `Effect`, `Option`, `pipe`, `Schema`, `Stream`, `String`, `SubscriptionRef`
From `effect/unstable/ai`: `Prompt`
From `effect/unstable/persistence`: `KeyValueStore`

### Part type

The part type for notes is `Note["parts"][number]` — i.e. `Prompt.Message | Response.StreamPart<AgentToolKit.tools>`. Derive it from `Note` schema, don't redeclare.

### Helper: `extractTitle(parts: ReadonlyArray<Part>) → string`

Pure function. Extracts a display title from the reduced parts array:

1. Walk the parts, accumulate only `text-delta` deltas (skip `Prompt.Message` and other part types) into a single string
2. Try to match the first markdown heading (`/^#\s+(.+)$/m`) — use `String.match`, `Option.map`, `Option.filter(String.isNonEmpty)`
3. If no heading: take first 50 chars of the accumulated text (trimmed)
4. If still empty: return `"Generating…"`

### NotesRepo (internal, not exported)

A scoped resource created once inside `RpcContracts.toLayer(...)`. Manages shared notes state.

**State**: `SubscriptionRef<ReadonlyArray<Note>>` initialized from `KeyValueStore` (key: `"notes"`, schema: `Schema.Array(Note)`, default: empty array).

**Operations**:

- `list` — `SubscriptionRef.changes(ref)` → `Stream<ReadonlyArray<Note>>`
- `upsert(note: Note)` — if note with same `id` exists, replace it; otherwise append. Then persist to KV.
- `remove(id: NoteId)` — filter out the note. Persist to KV.

Persist = `kvStore.set("notes", currentValue)` after every mutation.

### RPC Handlers (exported as `RpcHandlers`)

```
RpcContracts.toLayer(Effect.gen(function* () { ... }))
```

Inside the generator: create the NotesRepo, then return `RpcContracts.of({...})`.

#### `note.create(payload: Prompt.UserMessage) → NoteId`

1. Create a `Note` with a fresh id, title `"Generating…"`, parts `[]`
2. Upsert the placeholder note into NotesRepo
3. Fork a **daemon** fiber (`Effect.forkDaemon`) that:
   - Creates a fresh agent via `Agent.make`
   - Calls `agent.prompt(payload)` (this fires and runs in background via `FiberHandle`)
   - Pipes `agent.events` through `partsStreamReducer` to get `Stream<Part[]>`
   - Runs `Stream.runForEach` on the reduced stream: for each `parts` snapshot, build `new Note({id, title: extractTitle(parts), parts})` and call `notesRepo.upsert`
   - Wraps everything in `Effect.catchAllCause(Effect.logError)` so failures are logged, not lost
4. Return `note.id`
5. Wrap the whole handler in `Effect.mapError(cause => new NoteError({cause}))`

The daemon fiber is the key: it lives as long as the server process, runs independently of the client connection, and cannot be interrupted by client disconnect.

#### `note.list() → Stream<Array<Note>>`

Return `notesRepo.list` directly. The `SubscriptionRef.changes` stream emits the current value immediately on subscribe, then re-emits on every state change. This gives all clients real-time updates.

#### `note.delete(id: NoteId) → void`

Call `notesRepo.remove(id)`. Wrap in `Effect.mapError(cause => new NoteError({cause}))`.

No need to stop the agent fiber — if a generation is running for a deleted note, the next upsert from the daemon fiber will re-add it, but that's acceptable. If you want to prevent that: the daemon fiber can check if the note still exists before upserting (but this is an optimization, not required for v1).

## Behavior

### Success cases

- **Create**: User sends a message → gets back a NoteId immediately → within milliseconds the `note.list` stream emits with the placeholder note → as the AI generates, the stream keeps emitting with updated parts and title
- **List**: Client subscribes → gets current notes immediately → gets real-time updates as any note changes
- **Delete**: Note is removed → list stream emits without the deleted note → KV is updated

### Parallel generations

Multiple `note.create` calls spawn independent daemon fibers. Each has its own Agent instance (own Chat, own event stream). They all update the same `SubscriptionRef` — Effect handles the concurrency safely.

### Background persistence

Generations are daemon fibers. If the client disconnects, the fiber keeps running. When the client reconnects and subscribes to `note.list`, they get the current state (which may include partially or fully generated notes).

### Edge cases

- **Server restart during generation**: The generation fiber is lost, but any parts already persisted to KV are preserved. The note will have a partial response. This is acceptable.
- **Empty AI response**: Title stays `"Generating…"`, parts stay as whatever the stream emitted
- **KV read failure on startup**: Default to empty array (via `Option.getOrElse`)

### Error handling

- All handler errors are wrapped in `NoteError({cause})`
- Daemon fiber failures are caught with `Effect.catchAllCause(Effect.logError)` — logged but don't crash the server
- No internal re-validation of typed values

## Decisions

- **Daemon fibers over RcMap**: The current `RcMap` + `Scope` approach is unnecessarily complex for fire-and-forget generations. Daemon fibers are simpler and match the "no interruption" requirement.
- **Single SubscriptionRef over per-note refs**: One ref for the whole notes array keeps the model simple. The `partsStreamReducer` already debounces at 20ms, so update frequency is bounded.
- **Upsert over separate create/update**: Simplifies the repo interface. One operation handles both placeholder creation and streaming updates.
- **No agent cleanup on delete**: Simplest approach. The daemon fiber will finish naturally. If the deleted note gets re-added by a still-running generation, that's a minor cosmetic issue not worth the complexity of fiber tracking in v1.
- **`extractTitle` is a pure function, not an Effect**: It's just string manipulation on a parts array. No reason for it to be effectful.
- **Derive part type from `Note` schema**: Don't redeclare the union type. Use `Note["parts"][number]` or equivalent to stay in sync with the contract.
