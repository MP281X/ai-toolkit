# AI Message Components

## Goal

Build a set of AI message UI components in `packages/components/src/components/ai/` that render `Prompt.Message` types from Effect AI unstable module. Components use shadcn primitives, `<Markdown>` and `<Code>` from the render layer, and follow a minimal brutalist aesthetic with vertical colored bars per message.

## Decisions

- **Bar color**: orange (`border-primary`) for user, blue (`border-[oklch(0.65_0.15_250)]`) when `finishReason === "stop"`, muted (`border-muted-foreground/30`) otherwise
- **Iteration boundary**: determined by `FinishPart.reason === "stop"` — not positional
- **Metadata**: extracted from `ResponseMetadataPart` (modelId) and `FinishPart` (reason, usage) in the route's state reducer
- **Tool pairing**: `ToolCallPart` + `ToolResultPart` merged into one `Collapsible` — header shows the call, body shows plain-text result
- **ToolMessages hidden**: `role === "tool"` messages are not rendered as blocks; their results are paired into the preceding assistant message's tool call collapsibles
- **Tool results**: rendered as plain text
- **SystemMessage**: rendered as a muted debug block
- **All 6 part types** implemented in separate files
- **Vertical bar**: on each `Message` wrapper (not each Part)

## File Structure

```
packages/components/src/components/ai/
├── message.tsx                # Main Message component — pattern matches on role + parts
├── text-part.tsx              # TextPart → <Markdown>
├── reasoning-part.tsx         # ReasoningPart → Collapsible thinking block
├── file-part.tsx              # FilePart → image preview or file badge
├── tool-call-part.tsx         # Paired ToolCallPart + ToolResultPart collapsible
├── tool-approval-part.tsx     # ToolApprovalRequestPart + ToolApprovalResponsePart
```

## Component APIs

### `message.tsx` — Main Entry

```tsx
import type {Prompt, Response} from 'effect/unstable/ai'

export type MessageMetadata = {
  modelId?: string
  finishReason?: Response.FinishReason
  usage?: Response.Usage
}

export type MessageProps = {
  message: Prompt.Message
  metadata?: MessageMetadata
  toolResults?: ReadonlyMap<string, Prompt.ToolResultPart>
  approvalResponses?: ReadonlyMap<string, Prompt.ToolApprovalResponsePart>
  className?: string
}
```

Behavior:
- Wraps content in a `div` with 2px `border-l` using the bar color logic
- For `role === "user"`: orange bar, renders user parts (text, file)
- For `role === "assistant"`: bar depends on metadata.finishReason, shows metadata header (model badge, token counts via `formatTokens`), renders all assistant parts in order
- For `role === "system"`: muted bar + muted text, renders content string
- For `role === "tool"`: returns `null` (hidden — results shown in paired view)
- Iterates over `message.content` array, pattern-matching `part.type` to delegate to sub-components

### `text-part.tsx`

```tsx
export function TextPartView(props: {part: Prompt.TextPart; className?: string})
```

- Renders `part.text` via `<Markdown>` from `#components/render/markdown.tsx`

### `reasoning-part.tsx`

```tsx
export function ReasoningPartView(props: {part: Prompt.ReasoningPart; className?: string})
```

- `<Collapsible>` with `<CollapsibleTrigger>`: `<Brain />` icon + "Thinking…" label
- `<CollapsibleContent>`: renders `part.text` via `<Markdown>`
- Starts collapsed by default

### `file-part.tsx`

```tsx
export function FilePartView(props: {part: Prompt.FilePart; className?: string})
```

- If `mediaType` starts with `image/`: render `<img>` with object-URL from `part.data`
- Otherwise: `<Badge variant="outline">` with `<Paperclip />` icon + `fileName ?? mediaType`

### `tool-call-part.tsx`

```tsx
export function ToolCallPartView(props: {
  part: Prompt.ToolCallPart
  result?: Prompt.ToolResultPart
  className?: string
})
```

- `<Collapsible>` component
- **Trigger**: icon based on `part.name` (map: `shell` → `<Terminal />`, `apply_patch` → `<FilePen />`, `todo` → `<ListChecks />`, default → `<Wrench />`) + `part.name` as text + status indicator:
  - No result yet: `<Loader2 className="animate-spin" />`
  - Result success: `<Check />`
  - Result failure: `<AlertCircle className="text-destructive" />`
- **Content**: when `result` exists, render `String(result.result)` as plain text in a `<pre>` block with `text-xs text-muted-foreground` styling; if `result.isFailure`, add `text-destructive` class

### `tool-approval-part.tsx`

```tsx
export function ToolApprovalRequestView(props: {
  part: Prompt.ToolApprovalRequestPart
  response?: Prompt.ToolApprovalResponsePart
  className?: string
})
```

- Shows approval request: `<ShieldAlert />` icon + "Approval required" label + `part.toolCallId`
- If response exists: `<Badge>` showing approved (`<ShieldCheck />` green) or denied (`<ShieldX />` destructive) + optional `response.reason`

## Route File Changes (`apps/agent/src/routes/(home)/index.tsx`)

### State Model

Extend `MessagesState` to capture metadata per assistant turn:

```tsx
type TurnMetadata = {
  modelId?: string
  finishReason?: Response.FinishReason
  usage?: Response.Usage
}

type CommittedEntry = {
  message: Prompt.Message
  metadata?: TurnMetadata
}

type MessagesState = {
  readonly committed: CommittedEntry[]
  readonly inFlightAssistant: {
    readonly parts: Response.StreamPart<Record<never, never>>[]
    readonly metadata: TurnMetadata
  }
}
```

### Reducer Changes

In `reduceResponsePart`:
- On `response-metadata` event: capture `event.modelId` into `inFlightAssistant.metadata.modelId`
- On `finish` event: capture `event.reason` and `event.usage` into metadata, then finalize
- `finalizeAssistantTurn`: attach captured metadata to the last assistant message entry

### Render Changes

Build lookup maps before rendering:

```tsx
// Build tool results + approval responses maps from committed entries
const toolResults = new Map<string, Prompt.ToolResultPart>()
const approvalResponses = new Map<string, Prompt.ToolApprovalResponsePart>()

for (const entry of entries) {
  if (entry.message.role === 'tool') {
    for (const part of entry.message.content) {
      if (part.type === 'tool-result') toolResults.set(part.id, part)
      if (part.type === 'tool-approval-response') approvalResponses.set(part.approvalId, part)
    }
  }
}
```

Replace the current raw `<div>` rendering with:

```tsx
<Conversation>
  {entries
    .filter(e => e.message.role !== 'tool')
    .map((entry, i) => (
      <Message
        key={i}
        message={entry.message}
        metadata={entry.metadata}
        toolResults={toolResults}
        approvalResponses={approvalResponses}
      />
    ))}
</Conversation>
```

### Metadata Header (assistant messages)

```
┌─────────────────────────────────────────────────┐
│ [model-badge]  github-copilot/gpt-5.4    2.7k↓ 71↑ │
│ [text content rendered as markdown...]          │
│ ▸ shell  run-tests                         ✓   │
│ ▸ apply_patch                              ⟳   │
└─────────────────────────────────────────────────┘
```

- Model shown in `<Badge variant="outline">` using `modelId`
- Token counts: `formatTokens(inputTokens.total)↓ formatTokens(outputTokens.total)↑` in `text-muted-foreground text-xs`
- Only shown when metadata is present

## Icons Used (lucide-react)

`Brain`, `Terminal`, `FilePen`, `ListChecks`, `Wrench`, `Check`, `AlertCircle`, `Loader2`, `ShieldAlert`, `ShieldCheck`, `ShieldX`, `Paperclip`, `ChevronDown`, `User`, `Bot`

## Package Export

The existing `"./*": "./src/components/*.tsx"` glob in `packages/components/package.json` supports nested paths in Bun, so `@ai-toolkit/components/ai/message` resolves to `./src/components/ai/message.tsx` — no export changes needed.

## Visual Layout

```
                        Message with orange border-l-2
┌──────────────────────────────────────────────────┐
▌ [user text via Markdown]                          │
▌ [file attachment badge if any]                    │
└──────────────────────────────────────────────────┘

                        Message with muted border-l-2
┌──────────────────────────────────────────────────┐
▎ build  github-copilot/gpt-5.4       2.7k↓ 71↑   │
▎ [assistant text via Markdown]                     │
▎ ▸ shell  Runs final fix              ✓     ▾     │
▎ ▸ apply_patch                        ⟳     ▾     │
└──────────────────────────────────────────────────┘

                        Message with blue border-l-2 (finishReason=stop)
┌──────────────────────────────────────────────────┐
▌ build  github-copilot/gpt-5.4       1.1k↓ 93↑   │
▌ [final markdown text]                             │
└──────────────────────────────────────────────────┘
```
