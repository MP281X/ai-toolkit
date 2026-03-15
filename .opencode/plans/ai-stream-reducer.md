# AI Stream Reducer

## Goal

Build `reducer` in `packages/ai/src/reducer.ts` that transforms a `Stream<Prompt.Message | StreamPart<Record<never, never>>>` into `Stream<Array<Prompt.Message>>` — accumulating the full conversation on each token so the UI can render the entire history.

## Decisions

- **State shape**: `{ messages: Array<Prompt.Message>, finished: boolean }` — scan accumulator tracks message boundary via `finished` flag. Output is mapped to just `messages`.
- **`finished` starts `true`** — first StreamPart always creates a new AssistantMessage. Prompt.Messages always set `finished = true` (they're complete).
- **Dropped StreamPart types**: `response-metadata`, `source` (document/url), `error` — not representable in `Prompt.AssistantMessagePart`.
- **Text/Reasoning streaming**: `*-start` → append new `Prompt.TextPart`/`Prompt.ReasoningPart` with `text: ""`. `*-delta` → concat `delta` into last matching part. `*-end` → no-op.
- **Tool call flow**: `tool-params-start` → append `Prompt.ToolCallPart { id, name, params: undefined, providerExecuted }` (enables loading UI). `tool-params-delta` / `tool-params-end` → no-op. `tool-call` → find existing ToolCallPart by `id`, replace `params`; or append new one. `tool-result` → append `Prompt.ToolResultPart { id, name, result, isFailure }`.
- **File / tool-approval-request**: Convert from Response part → Prompt part via `Prompt.makePart(...)` and append.
- **Finish**: Sets `finished = true`. Next StreamPart creates a new AssistantMessage.

## Stream Part → Action Mapping

```
StreamPart.type          → Action on last AssistantMessage
─────────────────────────────────────────────────────────
text-start               → append TextPart { text: "" }
text-delta               → merge delta into last TextPart
text-end                 → no-op
reasoning-start          → append ReasoningPart { text: "" }
reasoning-delta          → merge delta into last ReasoningPart
reasoning-end            → no-op
tool-params-start        → append ToolCallPart { id, name, params: undefined }
tool-params-delta        → no-op
tool-params-end          → no-op
tool-call                → update existing ToolCallPart by id (or append)
tool-result              → append ToolResultPart
tool-approval-request    → append ToolApprovalRequestPart
file                     → append FilePart
finish                   → set finished = true
response-metadata        → drop
source                   → drop
error                    → drop
```

## State Machine

```
                    ┌──────────────┐
   Prompt.Message   │  finished=T  │◄──── initial state
   ──────────────►  │  append msg  │
                    └──────┬───────┘
                           │ StreamPart (not finish)
                           ▼
                    ┌──────────────┐
                    │  finished=F  │◄─┐ StreamPart (not finish)
                    │  new/update  │──┘ (update current AssistantMsg)
                    │  assistant   │
                    └──────┬───────┘
                           │ finish
                           ▼
                    ┌──────────────┐
                    │  finished=T  │
                    └──────────────┘
```

## Implementation

### 1. Tests (`packages/ai/src/reducer.test.ts`)

Write tests first using `bun:test`, `Effect`, `Stream`, `Prompt`, `Response`:

| Test | Input stream | Expected final messages |
|------|-------------|----------------------|
| history passthrough | `[UserMsg, AssistantMsg]` | `[UserMsg, AssistantMsg]` |
| text streaming | `[text-start, text-delta("Hello"), text-delta(" world"), text-end, finish]` | `[AssistantMsg { [TextPart "Hello world"] }]` |
| reasoning + text | `[reasoning-start, reasoning-delta("think"), reasoning-end, text-start, text-delta("answer"), text-end, finish]` | `[AssistantMsg { [ReasoningPart "think", TextPart "answer"] }]` |
| tool call flow | `[tool-params-start(id,name), tool-call(id,name,params), tool-result(id,name,result), finish]` | `[AssistantMsg { [ToolCallPart, ToolResultPart] }]` |
| finish boundary | `[text-start, text-delta("A"), finish, text-start, text-delta("B"), finish]` | `[AssistantMsg { [TextPart "A"] }, AssistantMsg { [TextPart "B"] }]` |
| history + streaming | `[UserMsg, text-start, text-delta("Hi"), text-end, finish]` | `[UserMsg, AssistantMsg { [TextPart "Hi"] }]` |
| dropped parts | `[text-start, text-delta("Hi"), response-metadata, text-end, finish]` | `[AssistantMsg { [TextPart "Hi"] }]` |
| file append | `[file(mediaType, data), finish]` | `[AssistantMsg { [FilePart] }]` |

Create stream parts with `Response.makePart(...)` and messages with `Prompt.makeMessage(...)`.
Each test: pipe stream through `reducer`, run `Stream.runLast`, assert on the final `Array<Prompt.Message>`.

### 2. Implementation (`packages/ai/src/reducer.ts`)

```ts
type State = { messages: Array<Prompt.Message>; finished: boolean }

// Stream.scan with State, map to messages
// Use Match.value(part.type) for dispatch
// Helper: getLastAssistant, updateLastContent, appendContent
```

Key helpers:
- `ensureAssistant(state)` — if `finished` or no last assistant msg, push new `Prompt.makeMessage('assistant', { content: [] })` and set `finished = false`
- `updateLastPart(content, fn)` — update last element of content array
- `findAndReplace(content, id, fn)` — find ToolCallPart by id and update

### 3. Validation

```bash
bun run fix
bun run check
```
