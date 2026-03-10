# AI Package Full Rewrite

## Goal

Clean rewrite of `@packages/ai/` and `@packages/components/src/components/ai/` targeting only the AI SDK adapter. Fully type-safe tools with literal discriminators, opencode-v2-inspired schemas, and simplified event reconstruction. Schema.File for attachments. Model passed per-prompt (runtime switchable). Approval flow preserved for future use. Only question + websearch tools for now.

## Decisions

- **Model**: passed per-prompt to `prompt(model, parts)`, resolved fresh each call
- **Tools scope**: question (pauses, user responds) + websearch (auto-execute, `needsApproval: true` for demo)
- **Tool typing**: flat discriminator `tool: Schema.tag('question')` on all tool-related schemas, typed input/output per tool
- **Tool schema**: one class per tool containing both input and output — extract sub-schemas via `.fields`
- **Events**: granular stream events, reconstruct messages on client via scan
- **Attachments**: `Schema.File` in PromptFilePart, auto-serializes as `{data: base64, type, name, lastModified}` over RPC, converted to AI SDK format in sdk.ts
- **Approval flow**: kept (tool-approval-request + tool-approval-response events)
- **Reasoning**: kept (reasoning-delta events)
- **Copilot agent**: deleted entirely
- **Exa**: keep raw exa-js with API key
- **Inline schemas**: don't over-split — keep schemas inline where possible, extract sub-schemas from parent when needed

## File Layout

### packages/ai/src/

```
catalog.ts    ← keep as-is
schema.ts     ← core: AiError, events, message parts, ConversationMessage, appendEvent, reconstructMessages
tool.ts       ← NEW: per-tool schemas (each tool = one class with input+output), ToolName, ToolInput/ToolOutput unions
service.ts    ← Agent service definition (simplified, no copilot)
sdk.ts        ← NEW: AI SDK adapter (replaces agents/ai-sdk.ts)
```

### Delete

```
packages/ai/src/agents/           (entire directory: ai-sdk.ts, copilot-sdk.ts)
packages/ai/src/tools.ts          (replaced by tool.ts)
```

### packages/ai/package.json

Exports:
```json
{
  "./catalog": "./src/catalog.ts",
  "./schema": "./src/schema.ts",
  "./tool": "./src/tool.ts",
  "./service": "./src/service.ts"
}
```

Remove `@opencode-ai/sdk`, `@github/copilot-sdk` from dependencies. Keep `ai`, `exa-js`, and provider SDKs.

---

## Schema Design (tool.ts)

One class per tool. Input and output co-located. No union schemas — events use `Schema.Unknown` for input/output, per-tool classes serve as decoders in components and constructors in sdk.ts.

```ts
// Tool name literal — discriminator
type ToolName = typeof ToolName.Type
const ToolName = Schema.Literals(['question', 'websearch'])

// ── Question ──
export class QuestionTool extends Schema.Class<QuestionTool>('QuestionTool')({
  tool: Schema.tag('question'),
  input: Schema.Struct({
    questions: Schema.NonEmptyArray(Schema.Struct({
      question: Schema.NonEmptyString,
      header: Schema.optional(Schema.NonEmptyString),
      options: Schema.Array(Schema.Struct({
        label: Schema.NonEmptyString,
        description: Schema.optional(Schema.NonEmptyString)
      })),
      multiple: Schema.optional(Schema.Boolean),
      custom: Schema.optional(Schema.Boolean)
    }))
  }),
  output: Schema.Struct({
    answers: Schema.NonEmptyArray(
      Schema.Array(Schema.NonEmptyString)   // each question → array of selected labels
    )
  })
}) {}

// ── Websearch ──
export class WebsearchTool extends Schema.Class<WebsearchTool>('WebsearchTool')({
  tool: Schema.tag('websearch'),
  input: Schema.Struct({
    query: Schema.NonEmptyString
  }),
  output: Schema.Struct({
    query: Schema.NonEmptyString,
    sources: Schema.NonEmptyArray(Schema.Struct({
      title: Schema.optional(Schema.NonEmptyString),
      url: Schema.NonEmptyString,
      publishedDate: Schema.optional(Schema.NonEmptyString),
      text: Schema.optional(Schema.String)
    }))
  })
}) {}
```

**No ToolInput/ToolOutput union schemas.** Events carry `Schema.Unknown` for input/output. Components decode using the per-tool class when they need typed access (e.g. `Schema.decodeUnknownOption(QuestionTool.fields.input)(part.input)`). Adding a new tool = add one class + extend ToolName literal.

---

## Schema Design (schema.ts)

### Error

```ts
export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.NonEmptyString)
}) {}
```

### Prompt parts

```ts
export class PromptTextPart extends Schema.TaggedClass<PromptTextPart>()('text', {
  text: Schema.NonEmptyString
}) {}

export class PromptFilePart extends Schema.TaggedClass<PromptFilePart>()('file', {
  file: Schema.File
}) {}

type PromptPart = typeof PromptPart.Type
const PromptPart = Schema.Union([PromptTextPart, PromptFilePart])
```

### Usage

```ts
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
  output: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
  reasoning: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0)))
}) {}
```

> Defaults kept here because the AI SDK returns null for token counts.

### Events (stream)

All as `Schema.TaggedClass` with `_tag` discriminator:

| Event                | Key fields |
|----------------------|------------|
| `message-start`     | messageId, model: ModelSelection, role, startedAt |
| `text-delta`        | messageId, partId, text |
| `reasoning-delta`   | messageId, partId, text |
| `file`              | messageId, partId, file: Schema.File |
| `tool-call`         | messageId, toolCallId, tool: ToolName, input: Schema.Unknown, state: `'running' \| 'pending-input'` |
| `tool-approval-request` | messageId, toolCallId, approvalId, tool: ToolName, input: Schema.Unknown |
| `tool-approval-response` | messageId, toolCallId, approvalId, decision: `'approve' \| 'deny'` |
| `tool-result`       | messageId, toolCallId, tool: ToolName, output: Schema.Unknown |
| `tool-error`        | messageId, toolCallId, tool: ToolName, error: Schema.Unknown |
| `message-finish`    | messageId, finishReason, usage |
| `message-error`     | messageId, error: Schema.Unknown |

`ConversationEvent = Schema.Union([...all events])`

### Response type (for `respond()`)

```ts
type AgentResponse = typeof AgentResponse.Type
const AgentResponse = Schema.Union([ToolApprovalResponse, ToolResultEvent])
```

### Message parts (reconstructed from events)

| Part       | Fields |
|------------|--------|
| TextPart   | id, text |
| ReasoningPart | id, text |
| FilePart   | id, file: Schema.File |
| ToolPart   | id, messageId, toolCallId, tool: ToolName, state: ToolState, input?: Schema.Unknown, output?: Schema.Unknown, error?, approvalId? |
| ErrorPart  | id, error |

`ToolState = Schema.Literals(['running', 'pending-input', 'pending-approval', 'completed', 'error', 'denied'])`

`MessagePart = Schema.Union([TextPart, ReasoningPart, FilePart, ToolPart, ErrorPart])`

### ConversationMessage

```ts
export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
  id: Schema.NonEmptyString,
  model: ModelSelection,
  role: MessageRole,        // 'user' | 'assistant'
  startedAt: Schema.Number,
  finishedAt: Schema.optional(Schema.Number),
  state: MessageState,      // 'streaming' | 'awaiting-response' | 'complete' | 'error'
  finishReason: Schema.optional(FinishReason),
  usage: Usage,
  parts: Schema.Array(MessagePart)
}) {}
```

### Event reconstruction

`appendEvent(messages, event)` — pure function using Match.tag on event._tag. Each case is 3-5 lines. Returns new array.

`reconstructMessages(events)` — `Array.reduce(events, [], appendEvent)`

---

## Service (service.ts)

```ts
export class Agent extends ServiceMap.Service<Agent, {
  prompt: (model: ModelSelection, parts: readonly PromptPart[]) => Effect.Effect<void, AiError>
  respond: (response: AgentResponse) => Effect.Effect<void, AiError>
  stream: Stream.Stream<ConversationEvent>
}>()('@ai-toolkit/ai/Agent') {
  static layer = AiSdkLayer   // from sdk.ts
}
```

No switch, no copilot. Future agents = new layer constructors on the class.

---

## SDK Adapter (sdk.ts)

Responsibilities:
1. Resolve language model from ModelSelection + provider catalog
2. Define AI SDK tools (question: no execute fn, websearch: execute with Exa + `needsApproval: true`)
3. Convert ConversationMessage[] → AI SDK ModelMessage[]
4. Convert Schema.File → base64 for AI SDK
5. Map `streamText` fullStream → ConversationEvent stream
6. Manage PubSub + Ref for conversation history
7. Export `AiSdkLayer: Layer<Agent>`

Key simplifications vs current:
- No normalizeToolInput/normalizeToolOutput — construct typed tool input/output directly
- No normalizeToolKind — tool names are known literals
- Schema.File → base64 helper centralized

---

## Component Rewrites

### packages/components/src/components/ai/

**message.tsx** — Same visual structure (colored left bar, model header, stats, parts). Clean up:
- Use Match.tag for part rendering instead of if-chains
- Props: `{message: ConversationMessage, onRespond?: (response: AgentResponse) => void}`
- Keep theme colors: blue=complete, red=error, violet=pending, primary=user

**text-delta.tsx** — Keep as-is (trivial)

**reasoning-delta.tsx** — Keep as-is (trivial)

**attachment.tsx** — Update for Schema.File: `URL.createObjectURL(file)` for images, show `file.name` for others

**error.tsx** — Keep as-is (trivial)

**tool-interaction.tsx** — FULL REWRITE:
- Match on `part.tool` to dispatch to tool-specific renderers
- QuestionTool: form with radios/checkboxes/input when pending-input, answers summary when completed
- WebsearchTool: query display, collapsible sources when completed
- GenericTool: fallback for future tools
- StatusDot: keep (spinning=running, pulsing-violet=pending, green=completed, red=error)
- ApprovalActions: Allow/Deny buttons, emit AgentResponse

**model-selector.tsx** — Minimal changes (import paths only)

---

## Consumer Updates

### apps/template/src/rpcs/ai/contracts.ts

```ts
export class AiContracts extends RpcGroup.make(
  Rpc.make('ai.events', { stream: true, success: ConversationEvent }),
  Rpc.make('ai.sendMessage', {
    payload: Schema.Struct({ model: ModelSelection, parts: Schema.NonEmptyArray(PromptPart) }),
    error: AiError
  }),
  Rpc.make('ai.tool', { payload: AgentResponse, error: AiError })
) {}
```

### apps/template/src/rpcs/ai/handlers.ts

Yield Agent, call `agent.prompt(input.model, input.parts)`.

### apps/template/src/routes/(home)/chat/index.tsx

- messagesAtom: same pattern, new schema types
- sendMessage payload includes model from local state
- Message callback renamed to `onRespond`

---

## Execution Order

1. **Delete old code first**: remove `agents/` directory, `tools.ts`, clear `schema.ts` and `service.ts` contents
2. Write `tool.ts` (pure schemas, no deps except effect)
3. Write `schema.ts` (depends on tool.ts)
4. Write `sdk.ts` (depends on schema.ts, tool.ts, catalog.ts)
5. Write `service.ts` (depends on sdk.ts, schema.ts)
6. Update `package.json` (exports + remove copilot/opencode deps)
7. Update RPC contracts + handlers
8. Rewrite AI components (tool-interaction.tsx, message.tsx, attachment.tsx)
9. Update chat route
10. Run `bun run fix && bun run check`
