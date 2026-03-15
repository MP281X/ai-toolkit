# Goal

Expose the shared `@ai-toolkit/ai` conversation through `@apps/agent/src/rpcs` so the client can:

- send `Prompt.UserMessage` values with text and file parts
- subscribe to one live RPC stream that first emits the current conversation, then streams new events token-by-token
- reconstruct `Prompt.Message[]` in `@apps/agent/src/routes/(home)/index.tsx` and drive `messagesAtom` in real time

## Decisions

- Conversation scope is **global shared chat** on the server.
- Fixed default model for first pass: `provider: 'openrouter'`, `model: 'openrouter/free'`.
- RPC uses only Effect AI schemas.
- Single live stream shape:
  - bootstrap: `Prompt.Message`
  - live user turns: `Prompt.UserMessage`
  - live assistant turns: `Response.StreamPart(Toolkit.empty)`
- The stream success schema is a union built from existing Effect schemas, not app-specific event classes.
- Send RPC payload is `Prompt.UserMessage` directly.
- Attachments are sent inline as `Uint8Array` inside `Prompt.FilePart`.
- New submits are **queued**, not rejected and not published early.
- `messagesAtom` stores `Prompt.Message[]`; internal scan state may keep extra in-flight assistant buffers.
- First pass assumes **no toolkit/tools**. If tools are added later, `Response.StreamPart(Toolkit.empty)` must be replaced with the real toolkit schema.

### Verified Effect AI behavior

- `Chat.streamText({ prompt })` streams `Response.StreamPart<...>` immediately, but updates `chat.history` only after the stream completes.
- `Prompt.UserMessage` already supports `text` and `file` parts.
- `Prompt.fromResponseParts(parts)` is the canonical helper to rebuild finalized assistant/tool messages from response parts.
- `Prompt.fromResponseParts(parts)` does **not** provide partial token-by-token reconstruction before `text-end` / `reasoning-end`.
- Effect AI has no built-in full chat stream playback helper; `PubSub` replay is bounded only.

## Build

### 1. Widen `packages/ai/src/service.ts`

Refactor the service from text-only prompting to full user-message input.

- Replace `prompt(message: Prompt.TextPart)` with `send(message: Prompt.UserMessage)`.
- Keep `chat` as the single shared `Chat.empty` instance.
- Replace the current assistant-only pubsub with a mixed event pubsub:

```ts
Prompt.Message | Response.StreamPart<Record<never, never>>
```

- Add sequential turn processing so ordering is stable:
  - enqueue incoming `Prompt.UserMessage`
  - when a turn starts, publish the user message to the event bus
  - call `chat.streamText({ prompt: Prompt.fromMessages([message]) })`
  - publish each streamed `Response.StreamPart` to the same event bus
- Do **not** publish queued user messages before their turn actually starts.

### 2. Add a gap-free event stream in `packages/ai/src/service.ts`

Expose one stream for the RPC layer.

- Subscribe to the pubsub **before** reading history.
- Read `chat.history`.
- Emit `history.content` first.
- Then continue with the live pubsub subscription.

This avoids missing events between snapshot and subscription.

ASCII flow:

```txt
subscribe live
   -> read history
   -> emit Prompt.Message[]
   -> emit future Prompt.UserMessage + Response.StreamPart
```

### 3. Define RPC contracts in `apps/agent/src/rpcs/contracts.ts`

Create a union from existing Effect schemas only:

```ts
const AgentEvent = Schema.Union([
  Prompt.Message,
  Response.StreamPart(Toolkit.empty)
])
```

Add RPCs:

- `agent.events`
  - `stream: true`
  - `success: AgentEvent`
- `agent.send`
  - `payload: Prompt.UserMessage`

No separate history RPC is needed in this first pass because the stream bootstraps with history.

### 4. Implement handlers in `apps/agent/src/rpcs/handlers.ts`

- Inject the shared `Agent` service.
- Map:

```ts
'agent.events' -> agent.events
'agent.send' -> agent.send
```

### 5. Wire server layers in `apps/agent/src/lib/serverRuntime.ts`

Provide:

- `Agent.layer`
- `Agent.resolveLanguageModel({ provider: 'openrouter', model: 'openrouter/free' })`

Keep existing RPC serialization and otel layers.

### 6. Rebuild the route atom in `apps/agent/src/routes/(home)/index.tsx`

Turn `messagesAtom` into a stream-backed atom built from `agent.events`.

Shape:

```ts
AtomRuntime.atom(
  pipe(
    RpcClient.asEffect(),
    Effect.map(client => client('agent.events')),
    Stream.unwrap,
    Stream.scan(initialState, reduceEvent),
    Stream.map(state => state.messages)
  )
)
```

Internal scan state should keep:

- committed `Prompt.Message[]`
- current assistant response parts
- partial text / reasoning accumulators for live token rendering

### 7. Client reconstruction strategy

Use two layers of reconstruction:

1. **Exact finalized reconstruction**
   - when an assistant turn completes, use `Prompt.fromResponseParts(parts)` to produce the final committed assistant/tool messages

2. **Live partial reconstruction**
   - add a small local reducer that mirrors the relevant `Prompt.fromResponseParts` logic for in-flight parts:
     - `text-start`, `text-delta`, `text-end`
     - `reasoning-start`, `reasoning-delta`, `reasoning-end`
   - materialize a temporary assistant message so `messagesAtom` updates token-by-token

For this first pass with `Toolkit.empty`, no tool-call/tool-result live handling is required.

### 8. Submit text and files from `ChatInput`

In `index.tsx`:

- read `payload.text`
- read each browser `File` into `Uint8Array`
- build `Prompt.userMessage({ content: [...] })`
  - include a `text` part only when non-empty
  - append one `file` part per attachment with `mediaType`, optional `fileName`, and `data: Uint8Array`
- call the `agent.send` mutation

### 9. Keep UI minimal for now

- `Conversation` can keep rendering simple debug output from `messagesAtom`.
- The important part for this pass is that the atom returns the shared conversation in real time.

## Validation

Run in `apps/agent/`:

```bash
bun run fix
bun run check
```
