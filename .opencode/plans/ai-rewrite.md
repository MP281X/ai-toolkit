# Goal

- Fully rewrite `packages/ai` from scratch as a clean, minimal conversation platform that normalizes:
  - Vercel AI SDK custom agents
  - GitHub Copilot SDK
  - OpenCode
- Keep the external service shape:
  - `Agent.layer(selection)`
  - `prompt(parts)`
  - `respond(response)`
  - `stream`
- Replace the current schemas/types/transforms with new normalized schemas built for the frontend first.
- Rewrite the AI view components from scratch while preserving the current visual style and keeping them directly coupled to the normalized AI types.

## Decisions

- This is a hard-break rewrite. Do not add a compatibility layer.
- Migrate `packages/ai`, the AI view components, the template RPC contracts/handlers, and the template chat route together.
- Keep `packages/ai/src/catalog.ts` as the base catalog file and extend it where the new adapters require more agent/provider/model entries.
- Keep the public service shape, but replace all current input/output/event/message schemas.
- One `Agent` instance owns exactly one conversation and exactly one fixed model selection for its full lifetime.
- The frontend continues to receive an append-only event stream and reconstructs messages locally with a helper.
- Do not build a generic adapter framework. Build three explicit adapters that all return the same public `Agent` service shape:
  - `ai`
  - `copilot`
  - `opencode`
- The Vercel AI SDK adapter is a custom research-agent family in v1, not a coding-agent shim.
- The Vercel AI SDK v1 tool surface is limited to:
  - `question`
  - `web`
- `web` is the single canonical normalized tool for web search/fetch and is backed by Exa.
- OpenCode targets the v2 interaction surface for question/response flows.
- Normalized approval stays binary:
  - `approve`
  - `deny`
- OpenCode maps normalized `approve` to OpenCode `"once"`.
- First-class canonical tool ids in v1 are:
  - `question`
  - `web`
  - `bash`
  - `read`
  - `write`
  - `patch`
  - `glob`
  - `grep`
- Unknown tools are lossy on purpose:
  - keep the raw tool name
  - keep lifecycle state
  - drop structured input/output
- Keep first-class file parts in the normalized conversation model.
- Keep AI views in scope only. Do not redesign `ChatInput`, `Conversation`, or `ModelSelector` as part of this rewrite.
- Keep `ModelSelector` standalone. Do not pretend the user can switch the model of an already-created agent instance.
- No Codex or Claude Code placeholders in v1.

## Public Surface

- Keep the package exports clean and small:
  - `@ai-toolkit/ai/catalog`
  - `@ai-toolkit/ai/service`
  - `@ai-toolkit/ai/schema`
  - `@ai-toolkit/ai/tools`
- Keep `schema.ts` for normalized conversation/event/message/response schemas.
- Keep `tools.ts` for canonical tool ids, tool schemas, and tool normalization.

```ts
{
  prompt: (parts: readonly PromptPart[]) => Effect.Effect<void, AiError>
  respond: (response: ToolResponse) => Effect.Effect<void, AiError>
  stream: Stream.Stream<ConversationEvent>
}
```

## Normalized Conversation Model

- Replace the current `StartPart` / `FinishPart` / `ToolPart` class-heavy model with a smaller normalized event model plus a derived message model.
- The stream model should be event-first, not message-first.
- Every event that mutates a message must carry an explicit `messageId`.
- Every text/reasoning delta event must carry a stable part id so the reconstruction helper can concatenate deltas without relying on position heuristics.
- Every tool lifecycle event must carry an explicit `toolCallId`.
- Approval events must carry an explicit `approvalId`.

- The normalized public types should be split into three levels:

1. Prompt input
   - `PromptPart = UserTextPart | FilePart`

2. Stream events
   - user/assistant message start
   - user/assistant message finish
   - text delta
   - reasoning delta
   - file part
   - tool call
   - tool approval request
   - tool approval response
   - tool result
   - tool error
   - message error

3. Derived reconstructed messages
   - `ConversationMessage`
   - `ConversationMessagePart`
   - helper(s) to append one event or reconstruct from a full event list

- `ConversationMessage` should stay frontend-oriented:
  - `id`
  - `role`
  - `model`
  - `startedAt`
  - `finishedAt?`
  - `state`
  - `finishReason?`
  - `usage`
  - `parts`

- Keep normalized message state minimal and explicit:
  - `streaming`
  - `awaiting-response`
  - `complete`
  - `error`

- Keep normalized finish reasons minimal and stable:
  - `stop`
  - `length`
  - `content-filter`
  - `tool-calls`
  - `error`
  - `other`

- Keep normalized usage intentionally small:
  - `input`
  - `output`
  - `reasoning`

- Keep normalized file parts frontend-safe and self-contained:
  - base64 data
  - media type
  - filename

## Tool Model

- Normalize every tool to two names:
  - `toolName`: raw SDK/tool name
  - `toolKind`: canonical tool id or raw fallback string
- The UI should render by `toolKind` and fall back to `toolName`.

- Normalize canonical names with this mapping:
  - `question`, `ask_user` -> `question`
  - `web_search`, `web_fetch`, `webfetch`, `search`, `fetch`, `url` -> `web`
  - `bash`, `shell` -> `bash`
  - `read`, `view` -> `read`
  - `write`, `create_file`, `edit` -> `write`
  - `patch`, `str_replace_editor` -> `patch`
  - `glob` -> `glob`
  - `grep` -> `grep`
  - anything else -> raw name

- Rebuild all canonical tool schemas from scratch around the frontend needs, not around the current code.
- Canonical tool schemas should keep only the fields the frontend truly uses.
- For non-canonical tools, do not preserve arbitrary opaque payloads.

- Minimum canonical tool coverage:

| Tool | Normalized input/output goal |
| --- | --- |
| `question` | structured questions in the OpenCode-style shape; normalized answers per question |
| `web` | query/url request + summarized text/sources result |
| `bash` | command-focused input + text output |
| `read` | file-path-focused input + text output |
| `write` | target-path-focused input + text output |
| `patch` | patch/file-target summary for UI + patch/text output for diff rendering |
| `glob` | pattern-focused input + text output |
| `grep` | pattern-focused input + text output |

- `question` should use the OpenCode-style request shape in v1:
  - `question`
  - `header`
  - `options`
  - `multiple?`
  - `custom?`
- `question` answers should normalize to one answer list per question so they map cleanly across:
  - Vercel AI SDK
  - Copilot user input
  - OpenCode v2 question replies

- Reconstructed tool/message state must distinguish these cases explicitly instead of inferring them from missing output:
  - running
  - pending approval
  - pending user input
  - success
  - error
  - denied

## Verified Adapter Contracts

| Adapter | Verified upstream surface to build on |
| --- | --- |
| `ai` | `streamText({ model, messages, tools }).fullStream`; tool helper uses `inputSchema`; stream emits `text-delta`, `reasoning-delta`, `file`, `tool-call`, `tool-approval-request`, `tool-result`, `tool-error`, `finish`, `error` |
| `copilot` | `new CopilotClient(...)`; `createSession(config)`; `session.send(...)`; `session.on(...)`; session emits `assistant.turn_start`, `assistant.message_delta`, `assistant.reasoning_delta`, `tool.execution_start`, `tool.execution_complete`, `assistant.usage`, `assistant.turn_end`, `session.error`, `session.idle` |
| `opencode` | OpenCode v2 question/part interaction APIs; question reply API; session/message APIs; event subscription stream; permission reply endpoint |

## Adapter Build

### `packages/ai/src/service.ts`

- Keep the public `Agent` service entrypoint.
- Keep `Agent.layer(selection)` as the single dispatch point.
- Extend dispatch to support:
  - `ai`
  - `copilot`
  - `opencode`
- Keep model immutability at layer creation time.

### `packages/ai/src/schema.ts`

- Rewrite the file completely.
- Define the new normalized public schemas and exported types.
- Export the reconstruction helpers that the frontend and RPC layer will use.
- Make reconstruction deterministic via explicit ids instead of the current last-message / last-tool search behavior.

### `packages/ai/src/tools.ts`

- Rewrite the file completely.
- Define:
  - canonical tool ids
  - canonical tool schemas
  - name normalization
  - input/output normalization
- Make lossy normalization an explicit feature for non-AI-SDK adapters.
- Drop the current over-broad generic unknown payload handling.

### `packages/ai/src/agents/ai-sdk.ts`

- Rewrite the adapter from scratch.
- Build it as a custom research-agent adapter using Vercel AI SDK `streamText`.
- Keep local conversation history only here because Vercel AI SDK does not own the full conversation state for this use case.
- Convert normalized prompt/message history into `ModelMessage[]` only inside this adapter.
- Stream normalized events directly from `TextStreamPart` members.
- Support only these first-class tools in v1:
  - `question`
  - `web`
- Keep AI SDK tool definitions local to this adapter or immediately beside it. Do not build a shared generic tool registry.
- `web` should be backed by Exa and normalized as one canonical `web` tool regardless of whether the upstream action is search-like or fetch-like.

### `packages/ai/src/agents/copilot-sdk.ts`

- Rewrite the adapter from scratch.
- Keep Copilot session ownership inside the SDK.
- Do not attempt to rebuild Copilot-native history from normalized events.
- Use local normalized event/message state only for:
  - frontend streaming
  - reconstruction
  - pending approval lookup
  - pending question lookup
- Map Copilot permission requests to normalized approval requests.
- Map Copilot user input requests to normalized `question` tool interactions.
- Normalize Copilot tool execution start/complete events to the new tool lifecycle model.
- Keep Copilot approval normalization binary only.

### `packages/ai/src/agents/opencode.ts`

- Add a new OpenCode adapter.
- Target OpenCode v2 for interactive question/response flows.
- Use the SDK question reply flow for normalized `question` responses.
- Use the permission reply API for normalized approvals, mapping `approve` -> `once`.
- Keep OpenCode conversation ownership inside the SDK.
- Use local normalized event/message state only for frontend streaming and interaction lookup.
- Map OpenCode question/tool events to the same normalized `question` tool lifecycle the other adapters use.
- Map OpenCode tool state transitions to the normalized tool lifecycle model.

## Catalog

- Keep `packages/ai/src/catalog.ts` as the base file.
- Extend it only as needed to support the rewritten adapter set.
- `ModelSelection` must continue to identify the adapter family and the fixed model/provider pair used to create one `Agent` instance.
- The template app must stop implying that the client can switch the model of an already-running conversation when the server-side layer is fixed.

## AI View Rewrite

- Rewrite these AI view files from scratch while preserving the current visual language:
  - `packages/components/src/components/ai/message.tsx`
  - `packages/components/src/components/ai/tool-interaction.tsx`
  - `packages/components/src/components/ai/text-delta.tsx`
  - `packages/components/src/components/ai/reasoning-delta.tsx`
  - `packages/components/src/components/ai/attachment.tsx`
  - `packages/components/src/components/ai/error.tsx`

- Keep the current style direction:
  - mono-heavy
  - sharp borders
  - compact metadata rows
  - visible tool/approval state
  - reuse current theme tokens and shadcn primitives

- The rewritten message component should be a thin renderer over the new normalized `ConversationMessage` shape.
- The rewritten tool interaction component should render directly from the explicit normalized tool state instead of inferring question/approval state from missing output.
- `question` UI must be rebuilt around the new canonical schema:
  - `options`
  - `multiple`
  - `custom`
- `web` rows should render from canonical query/url/source data.
- Unknown tools should render as compact generic rows with fallback status and raw name only.
- Keep using the existing render components where they already fit:
  - markdown
  - code
  - diff
- `patch` output should keep using the diff renderer when normalized output provides patch text.

## Consumer Migration

### RPC

- Update `apps/template/src/rpcs/ai/contracts.ts` to the new schemas:
  - `ai.events` -> `ConversationEvent`
  - `ai.sendMessage` -> normalized prompt parts
  - `ai.tool` -> normalized tool response

- Update `apps/template/src/rpcs/ai/handlers.ts` to the rewritten `Agent` layer and the new schema exports.

### Chat Route

- Update `apps/template/src/routes/(home)/chat/index.tsx` to:
  - consume the new event stream type
  - reconstruct messages with the new helper
  - send the new prompt part schema
  - send the new tool response schema
- Keep file uploads mapped into first-class normalized file prompt parts.
- Remove the current fake local model-switching behavior from the active conversation flow.
- If model information is shown in the chat UI, it should reflect the server-created fixed agent selection.

## Constraints

- Do not preserve any of the current schema/transformation/agent logic just because it already exists.
- The only current file intentionally retained as a base is `catalog.ts`.
- Keep adapter logic explicit and local, even if some mapping logic is duplicated.
- Do not create a reusable abstraction layer just to make the three adapters look symmetric internally.
- Keep the normalized API shaped around the frontend requirements, not around exact upstream wire fidelity.
- Lossy normalization is allowed for:
  - Copilot
  - OpenCode
- Unknown tools must stay intentionally minimal.

## Validation

- Run in order:
  - `bun run fix`
  - `bun run check`
