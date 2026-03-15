# AI Components Refactor

## Goal

Rewrite the `@ai-toolkit/components` AI message components and enrich the `@ai-toolkit/ai` reducer so the UI shows **all** information from `Prompt.Message` and `Response` schemas — including token usage, model ID, duration, finish reason, errors, and tool approval status.

## Decisions

- **Enrich the reducer** to output `ReducedMessage` (wraps `Prompt.Message` + metadata) instead of raw `Prompt.Message[]`
- **Measure duration** in the reducer (wallclock time from first stream part to `finish` per assistant turn)
- **Header-only metadata**: role + model + token icons + duration + finish reason — prefer icons over text
- **Skip** `DocumentSourcePart` and `UrlSourcePart` rendering for now
- **Show** `ErrorPart` as an inline alert block (inspired by `fallbacks.tsx`)
- **Show** `ToolApprovalRequestPart` as a status badge on tool calls
- **Keep one file per part** in `packages/components/src/components/ai/`

---

## Step 1 — New `ReducedMessage` type in `packages/ai/src/reducer.ts`

Create a wrapper type that carries metadata alongside each message:

```ts
interface MessageMetadata {
  readonly modelId: string | undefined
  readonly finishReason: Response.FinishReason | undefined
  readonly usage: Response.Usage | undefined
  readonly timestamp: DateTime.Utc | undefined
  readonly duration: number | undefined       // ms wallclock
  readonly errors: readonly unknown[]
}

interface ReducedMessage {
  readonly message: Prompt.Message
  readonly metadata: MessageMetadata | undefined  // only on assistant messages
}
```

- `response-metadata` → capture `modelId`, `timestamp` into pending metadata
- `finish` → capture `reason`, `usage`, compute `duration` (Date.now delta since first non-message part for that assistant turn)
- `error` → accumulate into `errors[]`
- Export as `ReducedMessage` from `packages/ai/src/reducer.ts`

Update reducer signature: `Stream<A, E, R> → Stream<ReducedMessage[], E, R>`

Update existing tests to use `ReducedMessage` shape. Add new tests for metadata capture.

## Step 2 — Update route to use `ReducedMessage`

In `apps/agent/src/routes/(home)/index.tsx`:

- Change `Message` import/prop from `Prompt.Message` to `ReducedMessage`
- Pass full `ReducedMessage` to the `<Message>` component

## Step 3 — Rewrite `message.tsx`

**Props**: `{ message: ReducedMessage; className?: string }`

Header bar (single row, `text-[11px] font-mono`):
```
[RoleIcon] role  ·  [CpuIcon] modelId  ·  [TimerIcon] duration  ·  [CoinsIcon] in/out tokens  ·  [FlagIcon] finishReason
```
- Use lucide icons: `UserIcon`, `SparklesIcon`, `WrenchIcon`, `CpuIcon`, `TimerIcon`, `CoinsIcon`, `FlagIcon`
- Items only render when the value is defined (metadata exists and field is non-null)
- Tokens: show as `123↓ 45↑` (input/output totals) — compact
- Duration: format as `1.2s` or `340ms`
- Finish reason: only show if not `"stop"` (to avoid noise)

Body: render parts array as before (text, reasoning, file, tool-call, tool-result, tool-approval-request, error).

Streaming indicator: keep existing pulse animation for empty assistant messages.

## Step 4 — Rewrite `text-part.tsx`

No changes needed — keep rendering `Markdown` from `part.text`. Keep it minimal.

## Step 5 — Rewrite `reasoning-part.tsx`

No changes needed — keep the left-border + muted markdown style.

## Step 6 — Rewrite `file-part.tsx`

No changes needed — image preview + generic file chip already works well.

## Step 7 — Rewrite `tool-call-part.tsx`

Refactor the existing component to reduce repetition. Current code has 4 near-identical render branches.

Changes:
- Accept `Prompt.ToolCallPart | Prompt.ToolResultPart | Prompt.ToolApprovalRequestPart`
- For `tool-approval-request`: render a distinct "awaiting approval" state with a `ShieldAlertIcon` and amber coloring
- For `tool-call` (in-progress): show spinner as today
- For `tool-result` (success): green dot
- For `tool-result` (failure): red dot + collapsible error using `formatError`
- Consolidate all branches into one `Collapsible` structure with a shared trigger layout
- Keep `ToolIcon` helper and `extractSummary` helper

## Step 8 — New `error-part.tsx`

Create new file for rendering `ErrorPart` (accumulated errors from streaming).

Style: use `Alert` component with `variant="destructive"` (same pattern as `fallbacks.tsx`):
```tsx
<Alert variant="destructive" className="...">
  <OctagonAlert />
  <AlertTitle>Stream error</AlertTitle>
  <AlertDescription>{formatError(error)}</AlertDescription>
</Alert>
```

## Step 9 — Validation

```bash
bun run fix
bun run check
```

Run existing reducer tests + verify new metadata tests pass.
