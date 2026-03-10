# Refactor AI Package: Fully Typed Tool I/O + AI SDK Types

## Goal

Eliminate all `Schema.Unknown`/`any` from `@packages/ai/` and `@packages/components/src/components/ai/`. Use AI SDK types directly for message building. Make tool inputs/outputs fully typed via discriminated unions per tool.

## Decisions

1. **Discriminated ToolPart per tool** — `QuestionToolPart | WebsearchToolPart`, each with typed `input`/`output` fields
2. **Discriminated tool events per tool** — `QuestionCallEvent`/`WebsearchCallEvent` and `QuestionResultEvent`/`WebsearchResultEvent` (typed I/O)
3. **Keep custom schemas for RPC** — `Usage`, `FinishReason`, etc. stay as Effect Schemas (needed for RPC serialization)
4. **Drop `query` from websearch output** — frontend gets query from `input`, no duplicate data
5. **Use AI SDK types for messages** — import `ModelMessage`, `UserModelMessage`, `AssistantModelMessage`, `ToolModelMessage` from `'ai'` directly, no manual type defs
6. **`effectSchema` adapter** — bridge `Schema<A>` → AI SDK `FlexibleSchema<A>` so tool defs get proper TypeScript inference
7. **Stringify all errors** — replace every `Schema.Unknown` error field with `Schema.String`

---

## File Changes

### 1. `packages/ai/src/tool.ts`

**Remove `query` from websearch output:**
```
WebsearchTool.output: { sources: NonEmptyArray(WebsearchSource) }
```
(no more `query` in output — it's already in `input`)

**Add `effectSchema` adapter:**
```ts
import {Either, Schema, TreeFormatter} from 'effect'
import type {FlexibleSchema} from 'ai'

export const effectSchema = <A, I>(schema: Schema.Schema<A, I>): FlexibleSchema<A> => ({
  validate: (value: unknown) => {
    const result = Schema.decodeUnknownEither(schema)(value)
    if (Either.isRight(result)) return {success: true, value: result.right}
    return {success: false, error: new Error(TreeFormatter.formatErrorSync(result.left))}
  },
  jsonSchema: Schema.toJsonSchemaDocument(schema).schema
})
```

**Keep**: `QuestionTool`, `WebsearchTool`, `ToolName` — no structural change besides removing `query` from websearch output.

**Remove**: `ToolInput`, `ToolOutput` unions (replaced by per-tool typed events/parts).

---

### 2. `packages/ai/src/schema.ts`

#### Replace generic tool events with per-tool typed events

**Delete:** `ToolCallEvent`, `ToolResultEvent`

**Add:**
```ts
export class QuestionCallEvent extends Schema.TaggedClass<QuestionCallEvent>()('question-call', {
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  input: QuestionTool.fields.input
}) {}

export class WebsearchCallEvent extends Schema.TaggedClass<WebsearchCallEvent>()('websearch-call', {
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  input: WebsearchTool.fields.input
}) {}

export class QuestionResultEvent extends Schema.TaggedClass<QuestionResultEvent>()('question-result', {
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  output: QuestionTool.fields.output
}) {}

export class WebsearchResultEvent extends Schema.TaggedClass<WebsearchResultEvent>()('websearch-result', {
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  output: WebsearchTool.fields.output
}) {}
```

**Keep (updated):** `ToolApprovalRequestEvent` — remove `input: Schema.Unknown`, keep `approvalId + toolCallId + tool: ToolName`

**Keep (updated):** `ToolErrorEvent` — change `error: Schema.Unknown` → `error: Schema.String`

#### Replace ToolPart with discriminated per-tool parts

**Delete:** `ToolPart` (single class)

**Add:**
```ts
export class QuestionToolPart extends Schema.TaggedClass<QuestionToolPart>()('question', {
  id: Schema.NonEmptyString,
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  state: ToolState,
  input: QuestionTool.fields.input,
  output: Schema.optional(QuestionTool.fields.output),
  error: Schema.optional(Schema.String)
}) {}

export class WebsearchToolPart extends Schema.TaggedClass<WebsearchToolPart>()('websearch', {
  id: Schema.NonEmptyString,
  messageId: Schema.NonEmptyString,
  toolCallId: Schema.NonEmptyString,
  state: ToolState,
  input: WebsearchTool.fields.input,
  output: Schema.optional(WebsearchTool.fields.output),
  error: Schema.optional(Schema.String),
  approvalId: Schema.optional(Schema.NonEmptyString)
}) {}

export type ToolPart = typeof ToolPart.Type
export const ToolPart = Schema.Union([QuestionToolPart, WebsearchToolPart])
```

Note: `QuestionToolPart` has no `approvalId` (question tool never needs approval).

#### Update unions

```ts
export const MessagePart = Schema.Union([
  TextPart, ReasoningPart, FilePart, QuestionToolPart, WebsearchToolPart, ErrorPart
])

export const ConversationEvent = Schema.Union([
  MessageStartEvent, TextDeltaEvent, ReasoningDeltaEvent, FileEvent,
  QuestionCallEvent, WebsearchCallEvent,
  ToolApprovalRequestEvent, ToolApprovalResponse,
  QuestionResultEvent, WebsearchResultEvent,
  ToolErrorEvent, MessageFinishEvent, MessageErrorEvent
])

export const AgentResponse = Schema.Union([ToolApprovalResponse, QuestionResultEvent])
```

Note: `WebsearchResultEvent` is NOT in `AgentResponse` — websearch results come from the `execute` function, never from the user.

#### Update `appendEvent`

Rewrite Match handlers:
- `'question-call'` → create `QuestionToolPart` with `state: 'pending-input'`
- `'websearch-call'` → create `WebsearchToolPart` with `state: 'running'`
- `'tool-approval-request'` → update existing websearch part: set `approvalId`, `state: 'pending-approval'`
- `'tool-approval-response'` → update existing websearch part: set state based on decision
- `'question-result'` → update existing question part: set `output`, `state: 'completed'`
- `'websearch-result'` → update existing websearch part: set `output`, `state: 'completed'`
- `'tool-error'` → update existing part: set `error`, `state: 'error'`

The `replacePart` and `replaceToolPart` helpers stay but operate on `QuestionToolPart | WebsearchToolPart`.

#### Update error fields

- `MessageErrorEvent.error`: `Schema.Unknown` → `Schema.String`
- `ErrorPart.error`: `Schema.Unknown` → `Schema.String`
- `AiError.cause`: `Schema.Unknown` → `Schema.optional(Schema.String)`

#### Delete

- `decodeToolInput`, `decodeToolOutput`, `decodeToolName` functions (no longer needed — AI SDK types flow directly)

---

### 3. `packages/ai/src/sdk.ts`

#### Delete manual types

Remove these type definitions entirely (lines 28–46):
```
UserContent, AssistantContent, ToolContent, ChatMessage
```

#### Import AI SDK types

```ts
import {
  type ModelMessage, type UserModelMessage, type AssistantModelMessage,
  type ToolModelMessage, type ToolResultPart, type ToolCallPart,
  type ToolApprovalRequest as AiToolApprovalRequest,
  type ToolApprovalResponse as AiToolApprovalResponse,
  type LanguageModelUsage,
  jsonSchema, streamText, tool
} from 'ai'
```

#### Typed tool definitions using `effectSchema`

```ts
import {effectSchema} from './tool.ts'

const questionDef = tool({
  description: 'Ask the user a follow-up question',
  inputSchema: effectSchema(QuestionTool.fields.input)
})

const websearchDef = (exa: Exa) => tool({
  description: 'Search the web for current information',
  inputSchema: effectSchema(WebsearchTool.fields.input),
  outputSchema: effectSchema(WebsearchTool.fields.output),
  needsApproval: true,
  execute: async input => {
    // input is typed as { query: string } — no decode needed
    const res = await exa.searchAndContents(input.query, {numResults: 5, text: true})
    const sources = /* same formatting as before */
    return {sources}  // typed as WebsearchOutput — no decode needed
  }
})
```

Now `streamText({model, messages, tools: {question: questionDef, websearch: websearchDef(exa)}})` gives fully typed stream parts.

#### Rewrite stream handler (no decoding)

```ts
case 'tool-call':
  if (part.toolName === 'question') {
    // part.input typed as { questions: [...] }
    return emit(new QuestionCallEvent({messageId, toolCallId: part.toolCallId, input: part.input}))
  }
  if (part.toolName === 'websearch') {
    // part.input typed as { query: string }
    return emit(new WebsearchCallEvent({messageId, toolCallId: part.toolCallId, input: part.input}))
  }
  return Effect.void

case 'tool-approval-request':
  return emit(new ToolApprovalRequestEvent({
    messageId,
    toolCallId: part.toolCall.toolCallId,
    approvalId: part.approvalId,
    tool: part.toolCall.toolName as typeof ToolName.Type  // AI SDK narrows to 'question'|'websearch'
  }))

case 'tool-result':
  if (part.toolName === 'websearch') {
    // part.output typed as { sources: [...] }
    return emit(new WebsearchResultEvent({messageId, toolCallId: part.toolCallId, output: part.output}))
  }
  return Effect.void

case 'tool-error':
  return emit(new ToolErrorEvent({
    messageId,
    toolCallId: part.toolCallId,
    tool: part.toolName as typeof ToolName.Type,
    error: part.error instanceof Error ? part.error.message : String(part.error)
  }))
```

#### Rewrite `historyMessages` — use AI SDK types directly

```ts
const historyMessages = Effect.fnUntraced(function* (events: readonly ConversationEvent[]) {
  const msgs = reconstructMessages(events)
  const out: ModelMessage[] = []

  for (const message of msgs) {
    if (message.role === 'user') {
      // Build UserModelMessage content using AI SDK's TextPart/FilePart types
      const content: (AiTextPart | AiFilePart)[] = [...]
      out.push({role: 'user', content})
      continue
    }

    // Build AssistantModelMessage content
    const assistantParts: AssistantContent = []
    for (const part of message.parts) {
      // Match on 'text' | 'reasoning' | 'file' | 'question' | 'websearch'
      // Push AI SDK ToolCallPart for tool parts
      // Push AI SDK ToolApprovalRequest for parts with approvalId
    }
    if (assistantParts.length > 0) out.push({role: 'assistant', content: assistantParts})

    // Build ToolModelMessage content
    const toolParts: (ToolResultPart | AiToolApprovalResponse)[] = []
    for (const part of message.parts) {
      // Push AI SDK ToolResultPart for completed tools
      // Push AI SDK ToolApprovalResponse for approved/denied parts
    }
    if (toolParts.length > 0) out.push({role: 'tool', content: toolParts})
  }
  return out
})
```

No `as ModelMessage[]` cast — objects conform to AI SDK types directly.

#### Type the usage mapping

```ts
const usage = (raw: LanguageModelUsage) => new Usage({
  input: raw.inputTokens ?? 0,
  output: raw.outputTokens ?? 0,
  reasoning: raw.reasoningTokens ?? 0
})
```

#### Stringify error in MessageErrorEvent

```ts
case 'error':
  return emit(new MessageErrorEvent({
    messageId,
    error: part.error instanceof Error ? part.error.message : String(part.error)
  }))
```

#### Delete

- `decodeToolName`, `decodeQuestionInput`, `decodeQuestionOutput`, `decodeWebsearchInput`, `decodeWebsearchOutput` constants
- `decodeToolInput`, `decodeToolOutput` functions
- Manual `UserContent`, `AssistantContent`, `ToolContent`, `ChatMessage` types

---

### 4. `packages/components/src/components/ai/message.tsx`

Update `MessagePart` match to use new tool tags:

```tsx
Match.tag('text', value => <TextDelta key={value.id} text={value.text} />),
Match.tag('reasoning', value => <ReasoningDelta key={value.id} text={value.text} />),
Match.tag('file', value => <Attachment key={value.id} file={value.file} />),
Match.tag('question', value => <ToolInteraction key={value.id} part={value} onRespond={props.onRespond} />),
Match.tag('websearch', value => <ToolInteraction key={value.id} part={value} onRespond={props.onRespond} />),
Match.tag('error', value => <ErrorMessage key={value.id} error={value.error} />),
Match.exhaustive
```

---

### 5. `packages/components/src/components/ai/tool-interaction.tsx`

**Remove all `Schema.decodeUnknownOption` calls** — parts are already typed.

**Update component props:**
- `ToolInteraction` accepts `ToolPart` (the union `QuestionToolPart | WebsearchToolPart`)
- `QuestionRenderer` accepts `QuestionToolPart` directly — `part.input.questions` is typed
- `WebsearchRenderer` accepts `WebsearchToolPart` directly — `part.input.query` is typed, `part.output?.sources` is typed
- `ApprovalActions` only appears for `WebsearchToolPart` (question never needs approval)
- `StatusDot` stays — operates on `ToolPart['state']` which is still `ToolState`
- `GenericTool` fallback can be removed (exhaustive matching handles all tools)

**Update `QuestionRenderer` submit handler:**
```tsx
props.onRespond?.(
  new QuestionResultEvent({
    messageId: props.part.messageId,
    toolCallId: props.part.toolCallId,
    output: {answers: next}
  })
)
```
(was `new ToolResultEvent({..., tool: 'question', output: {answers: next}})`)

**Update `WebsearchRenderer`:**
- Get query from `part.input.query` instead of decoding `part.output?.query`
- Access `part.output?.sources` directly (typed, no decode)

**Remove imports:**
- `Schema` (no longer needed for decoding)
- `QuestionTool`, `WebsearchTool` from `@ai-toolkit/ai/tool` (types come from the part itself)

---

### 6. `apps/template/src/rpcs/ai/contracts.ts`

No structural changes — `ConversationEvent`, `AgentResponse`, `PromptPart` schemas are updated upstream. RPC contracts use them transparently.

Verify: `AgentResponse` now = `ToolApprovalResponse | QuestionResultEvent` — this is correct since users only send approval responses and question answers.

---

### 7. `apps/template/src/routes/(home)/chat/index.tsx`

No changes needed — component uses `ConversationMessage` which is updated upstream.

---

## Validation

After implementation, run:
```bash
bun run fix
bun run check
```

Verify zero `Schema.Unknown`, zero `as` casts, zero `any` in `packages/ai/src/` and `packages/components/src/components/ai/`.
