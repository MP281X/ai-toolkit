# Refactor Note App to Agent-Based Architecture

## Goal

Replace `generateObject`-based note creation with an Agent-based approach. The conversation stream (user input, tool calls/results, text response) becomes the note itself. This gives streaming progress during creation, visible tool activity, and better model compatibility.

Current pain points:
- `generateObject` fails with some models
- No progress feedback during note creation
- Structured output schema is rigid and doesn't surface research steps

## Interface

### Note

```
Note {
  id: NoteId
  title: string          -- derived from first # heading in the agent's text response
  parts: Part[]          -- the accumulated conversation parts (from the agent's event stream, reduced)
}
```

- `parts` stores the output of the stream reducer — user messages, tool calls, tool results, and merged text blocks
- No separate `sources` field — tool results (WebSearch, WebFetch) naturally contain links and fetched content
- Title is extracted from the first markdown `# heading` in the agent's text. Fallback: first 50 characters of text, or "Untitled Note"

### RPC Contracts

| Endpoint | Type | Payload | Success | Error |
|---|---|---|---|---|
| `note.create` | **stream** | `{ text: NonEmptyString, files: File[] }` | Part (individual stream parts) | NoteError |
| `note.list` | stream (unchanged) | — | `Note[]` | NoteError |
| `note.delete` | request (unchanged) | `NoteId` | — | NoteError |

- `note.create` becomes a streaming RPC — it streams conversation parts as they happen
- `note.list` and `note.delete` remain unchanged in shape

### Part Schema

The streamed/stored parts follow the same shape as the Agent's event stream (after sanitization and reduction). A Schema must be defined for RPC serialization. The relevant part types to handle:

- **User messages**: the initial prompt (text + file parts)
- **Tool calls**: agent requesting WebSearch/WebFetch (name, args)
- **Tool results**: data returned by tools (search results with URLs, fetched page content)
- **Text**: the agent's written response (streamed as deltas, stored as merged text)
- **Metadata/finish**: model info, completion reason — can be filtered out or kept

Take inspiration from the Agent module's `makeResumableStream` and `partsStreamReducer` patterns. The reducer merges adjacent text/reasoning deltas and filters noise — use it (or its pattern) to produce clean parts for both streaming and storage.

## Behavior

### note.create

1. Creates a fresh Agent instance (not the global singleton) with WebSearch + WebFetch tools
2. Sends the user message (text + files) with a system prompt
3. Streams conversation parts to the client as they happen — tool calls, tool results, text deltas
4. Client accumulates parts and renders them in real-time
5. On completion: reduces accumulated parts (merge text deltas), extracts title from first heading, persists the note
6. The persisted note appears in `note.list` stream
7. On error: stream errors, no note is persisted

### System Prompt

Instruct the agent to:
- Research the topic using available tools (web search, web fetch) as needed
- Write a well-structured markdown note starting with a `# Title` heading
- Use headings, bullet points, and code blocks for readability
- Synthesize information from fetched sources into coherent content

### UI — Left Panel (note list)

Unchanged in structure:
- Search box filtering notes
- Note count
- Scrollable note rows: title + content preview + delete button
- Preview derived from the text content in the note's parts

### UI — Right Panel (note detail)

Renders the note's parts in order:
- **User message**: shows the original input text and uploaded file names
- **Tool calls / results**: shows tool activity — search queries, fetched URLs, returned content (these replace the old "sources" section)
- **Text**: rendered as markdown — this is the actual note body

During creation (streaming):
- Shows parts as they arrive in real-time
- Tool activity visible as the agent researches
- Text grows as the agent writes
- Loading/progress state visible

After creation:
- Same layout, fully rendered from persisted parts

### UI — Composer

Same as current: text input + file upload + submit button with loading state.

### Edge Cases

- **Empty text after trim**: reject, don't create
- **Agent error mid-stream**: stream errors to client, show error state, no note persisted
- **No heading in response**: title falls back to first 50 chars of text content
- **No text in response**: unlikely but handle gracefully — title "Untitled Note"

## Decisions

- **Single prompt per note** — no follow-up messages, each creation is independent
- **Title from first heading** — no extra LLM call, no custom setTitle tool, just a clear system prompt
- **Stream individual parts** — client accumulates (not full-state snapshots)
- **Fresh agent per creation** — scoped instance, not the global Agent service singleton
- **Parts stored directly** — the reduced stream parts are the note's data, no custom intermediate type
- **Sources replaced by tool results** — the old `Note.sources` field is removed entirely
