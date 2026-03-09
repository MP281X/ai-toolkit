# Goal

- Fix provider-specific tool lifecycle bugs, with priority on Copilot tool handling.
- Restore correct question UX, remove misleading duplicate intent rows, hide empty expanders, and fix OpenCode session startup.

## Decisions

- Keep `report_intent` displayed as a normal tool row in the app UI.
- For Copilot, show all intent updates, but dedupe exact consecutive duplicate intent entries.
- Question tools use the custom question UI only, always fully expanded, never collapsible.
- After a question is answered, show both the original questions and the user's responses in that same custom question UI.
- Tools that finish with empty `body` / `output` must not render an expand button or expandable section.
- OpenCode session creation must use the SDK's direct `Session` response shape.

## Build

- Update the Copilot adapter in `packages/ai/src/agents/copilot-sdk.ts` so question tool calls complete like normal tool calls.
  - Keep the pending question tool metadata alive until completion.
  - When the user responds, emit a final `ToolResultEvent` for the same `toolCallId` with `QuestionToolOutput`.
  - Do not let the completed question fall through as an unnamed generic tool row.

- Adjust Copilot intent handling in `packages/ai/src/agents/copilot-sdk.ts`.
  - Continue mapping `assistant.intent` into normal `report_intent` tool parts for the shared UI.
  - Suppress only exact consecutive duplicate intent entries within the relevant assistant flow.
  - Preserve distinct intent updates as separate visible rows.

- Update tool rendering in `packages/components/src/components/ai/tool-interaction.tsx`.
  - Keep question tools on the custom non-collapsible UI for both pending and completed states.
  - Only render collapsible affordances for tools that actually have visible output or an error to show.
  - If a tool succeeds with empty output, render a flat summary row with no expand button.

- Verify the message rendering path in `packages/components/src/components/ai/message.tsx` still renders provider output directly once the underlying tool parts are corrected.

- Fix OpenCode session creation in `packages/ai/src/agents/opencode.ts`.
  - Treat `client.session.create(...)` as returning a direct `Session` object.
  - Read the new session id from `created.id`, not `created.data.id`.
  - Keep the existing failure path only for truly missing session objects.

## Examples

- Copilot completed question row:
  - header: `question`
  - body: question text + available options
  - response section: the user's submitted answer(s)

- Empty approved tool row:
  - visible summary only
  - no chevron
  - no collapsible content region
