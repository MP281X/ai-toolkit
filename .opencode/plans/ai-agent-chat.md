# Goal

Build an AI chat agent using the unstable Effect AI module (`effect/unstable/ai`). The system has three layers:

1. **`@ai-toolkit/ai` package** — reusable conversation service, tool definitions, model resolver
2. **`@apps/template/src/rpcs/ai/`** — RPC handlers with multi-session management via `RcMap`
3. **`@packages/components/src/components/ai/`** + route — UI for messages, tool calls, approvals, and the question tool

## Decisions

- Conversation lifecycle is a `Make`-style service in `@ai-toolkit/ai/service` wrapping `Chat` from `effect/unstable/ai`.
- Multi-session management lives in the RPC handler layer using `RcMap<sessionId, ConversationService>`. Sessions persist in memory for server lifetime.
- RPC architecture: one streaming RPC (`ai.conversation`) emitting `StreamPart[]` via `SubscriptionRef`, plus action RPCs (`ai.sendMessage`, `ai.approveTool`, `ai.denyTool`).
- Model is switchable mid-conversation (but locked during pending tool approval/response). The `LanguageModel` layer is resolved dynamically from the catalog per request.
- System prompt: simple hardcoded default ("You are a helpful assistant").
- Question tool schema mirrors OpenCode: `{ questions: [{ question, header, options: [{ label, description }], multiple? }] }`. Custom/free-text answer is always available (automatic "Type your own answer" option on the UI side).
- Web search: user-defined `Tool.make("WebSearch", ...)` calling `exa-js` server-side. Works with all adapters.
- Dummy approval tool: `Tool.make("DangerousAction", { needsApproval: true })` for testing the approval UI flow.
- Provider-defined tools (OpenAI/Anthropic WebSearch) are NOT used. Exa handles all web search uniformly.

## Build

### 1. `@ai-toolkit/ai/src/tool.ts` — Tool definitions

Define three tools using `Tool.make` from `effect/unstable/ai`:

**QuestionTool**
```ts
Tool.make("Question", {
  description: "Ask the user questions to gather preferences, clarify ambiguity, or get decisions. Usage: set multiple=true to allow multi-select. A free text option is always shown automatically.",
  parameters: Schema.Struct({
    questions: Schema.Array(Schema.Struct({
      question: Schema.String,
      header: Schema.String,
      options: Schema.Array(Schema.Struct({
        label: Schema.String,
        description: Schema.String
      })),
      multiple: Schema.optionalWith(Schema.Boolean, { default: () => false })
    }))
  }),
  success: Schema.String
})
```
- `needsApproval` is NOT set — the question tool pauses naturally because the handler waits for user input (via a `Deferred`).

**WebSearchTool**
```ts
Tool.make("WebSearch", {
  description: "Search the web for current information",
  parameters: Schema.Struct({
    query: Schema.String
  }),
  success: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      text: Schema.String
    }))
  })
})
```

**DangerousActionTool** (dummy, for testing approval flow)
```ts
Tool.make("DangerousAction", {
  description: "A dangerous action that requires user approval before execution",
  parameters: Schema.Struct({
    action: Schema.String,
    reason: Schema.String
  }),
  success: Schema.String,
  needsApproval: true
})
```

Create the toolkit:
```ts
export const AgentToolkit = Toolkit.make(QuestionTool, WebSearchTool, DangerousActionTool)
```

### 2. `@ai-toolkit/ai/src/catalog.ts` — Add adapter client layer resolver

Add a function `resolveModelLayer` that takes a `ModelSelection` and returns a `Layer<LanguageModel>`:

```
resolveModelLayer(selection) =>
  1. Find model entry in `models` array
  2. Find provider entry in `providers` array
  3. Based on `adapter` field:
     - "openai"           → OpenAiLanguageModel.layer({ model }) + OpenAiClient.layer({ apiUrl, apiKey })
     - "openai-compatible" → OpenAiCompatLanguageModel.layer({ model }) + OpenAiCompatClient.layer({ apiUrl, apiKey })
     - "anthropic"        → AnthropicLanguageModel.layer({ model }) + AnthropicClient.layer({ apiUrl, apiKey })
     - "openrouter"       → OpenRouterLanguageModel.layer({ model }) + OpenRouterClient.layer({ apiUrl, apiKey })
  4. API keys read from env via Config (e.g., Config.string(entry.apiKeyEnv))
  5. Returns Layer.Layer<LanguageModel.LanguageModel>
```

Each adapter client is constructed with the provider's `baseUrl` and the env-sourced API key. For `copilot` (no apiKeyEnv), use a placeholder or skip auth header.

### 3. `@ai-toolkit/ai/src/service.ts` — ConversationService

A `Make`-constructor service managing a single conversation lifecycle:

```
ConversationService.make(options: { model: ModelSelection }) => Effect<ConversationService>
```

**Internal state:**
- `chat: Chat.Service` — from `Chat.empty`
- `model: Ref<ModelSelection>` — current model, switchable
- `parts: SubscriptionRef<StreamPart[]>` — all accumulated response parts, drives the RPC stream
- `pendingQuestions: Map<toolCallId, Deferred<string>>` — question tool responses awaited from UI
- `isProcessing: Ref<boolean>` — prevents model switch during active generation

**Methods:**
- `sendMessage(text: string)` — appends user message, calls `chat.streamText({ toolkit, prompt: text })` on the resolved `LanguageModel` layer, pipes stream parts into `parts` SubscriptionRef. The toolkit handlers are wired inline.
- `switchModel(model: ModelSelection)` — updates the model ref (fails if `isProcessing`)
- `answerQuestion(toolCallId: string, answer: string)` — resolves the corresponding `Deferred`
- `approveTool(approvalId: string)` — re-invokes `chat.generateText/streamText` with the approval in the prompt
- `denyTool(approvalId: string, reason?: string)` — same but with denial

**Toolkit handler wiring** (inside `sendMessage`):
- `Question` handler: creates a `Deferred`, stores it in `pendingQuestions` keyed by toolCallId, awaits it. When UI calls `answerQuestion`, the deferred is resolved and the handler returns the answer string.
- `WebSearch` handler: instantiates `Exa` with `Config.string("AI_EXA")`, calls `exa.search(params.query)`, maps results.
- `DangerousAction` handler: returns `Effect.succeed("Action completed: " + params.action)` (the approval gate is handled by the framework via `needsApproval`).

The `LanguageModel` layer is resolved per `sendMessage` call using `resolveModelLayer(yield* Ref.get(model))` and provided to the stream effect.

### 4. `@apps/template/src/rpcs/ai/contracts.ts` — RPC contracts

```ts
export class AiContracts extends RpcGroup.make(
  Rpc.make("ai.conversation", {
    payload: Schema.Struct({ sessionId: Schema.String }),
    stream: true,
    success: Schema.Unknown // StreamPart[] — kept as Unknown since StreamPart is complex
  }),
  Rpc.make("ai.sendMessage", {
    payload: Schema.Struct({
      sessionId: Schema.String,
      text: Schema.String,
      model: ModelSelection
    })
  }),
  Rpc.make("ai.answerQuestion", {
    payload: Schema.Struct({
      sessionId: Schema.String,
      toolCallId: Schema.String,
      answer: Schema.String
    })
  }),
  Rpc.make("ai.approveTool", {
    payload: Schema.Struct({
      sessionId: Schema.String,
      approvalId: Schema.String
    })
  }),
  Rpc.make("ai.denyTool", {
    payload: Schema.Struct({
      sessionId: Schema.String,
      approvalId: Schema.String,
      reason: Schema.optionalWith(Schema.String, { default: () => "" })
    })
  })
) {}
```

### 5. `@apps/template/src/rpcs/ai/handlers.ts` — RPC handlers

```ts
export const AiLive = AiContracts.toLayer(
  Effect.gen(function*() {
    const sessions = yield* RcMap.make({
      lookup: (sessionId: string) =>
        ConversationService.make({ model: defaultModel }),
      idleTimeToLive: Duration.minutes(30)
    })

    return AiContracts.of({
      "ai.conversation": (payload) =>
        RcMap.get(sessions, payload.sessionId).pipe(
          Effect.flatMap(svc => SubscriptionRef.changes(svc.parts))
        ),
      "ai.sendMessage": (payload) =>
        RcMap.get(sessions, payload.sessionId).pipe(
          Effect.flatMap(svc => svc.switchModel(payload.model)),
          Effect.flatMap(svc => svc.sendMessage(payload.text))
        ),
      "ai.answerQuestion": (payload) =>
        RcMap.get(sessions, payload.sessionId).pipe(
          Effect.flatMap(svc => svc.answerQuestion(payload.toolCallId, payload.answer))
        ),
      "ai.approveTool": (payload) =>
        RcMap.get(sessions, payload.sessionId).pipe(
          Effect.flatMap(svc => svc.approveTool(payload.approvalId))
        ),
      "ai.denyTool": (payload) =>
        RcMap.get(sessions, payload.sessionId).pipe(
          Effect.flatMap(svc => svc.denyTool(payload.approvalId, payload.reason))
        )
    })
  })
)
```

### 6. `@apps/template/src/lib/serverRuntime.ts` — Wire AI handler

Add `AiLive` to the server layer stack (already imported but currently empty).

### 7. `@packages/components/src/components/ai/` — UI Components

Create these components in the `ai/` folder:

**`message.tsx`** — Renders a single message (user or assistant). Assistant messages render streamed parts:
- Text parts → rendered as markdown/text
- Tool call parts → show tool name + params (collapsible)
- Tool result parts → show result inline
- Tool approval request → show approve/deny buttons + tool call details
- Question parts → (handled by question component)
- Source parts → rendered as citation links

**`question.tsx`** — Renders the Question tool UI:
- Shows `header` as title, `question` as description
- Renders `options` as selectable cards (single or multi-select based on `multiple`)
- Always shows a free text input ("Type your own answer")
- Submit button sends answer back via `ai.answerQuestion` RPC

**`approval.tsx`** — Renders tool approval UI:
- Shows tool name, parameters
- Approve / Deny buttons (deny has optional reason input)
- Calls `ai.approveTool` or `ai.denyTool` RPC

### 8. `@apps/template/src/routes/(home)/chat/index.tsx` — Chat page

Wire the route to:
1. Generate/maintain a `sessionId` (e.g., `crypto.randomUUID()`, stored in state)
2. Subscribe to `ai.conversation` streaming RPC with that sessionId
3. Render parts via the `Conversation` component + AI message components
4. `ChatInput.onSubmit` → call `ai.sendMessage` RPC with text + selected model
5. Add model selector in the `Toolbar` slot (dropdown of models from catalog)
6. Handle question/approval tool interactions via the respective components
