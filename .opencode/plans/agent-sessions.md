# Agent Sessions

## Goal

The agent app has a single global conversation. Add **multi-session support**: each session is an independent conversation keyed by `sessionId`, with a sidebar to list/create/delete sessions, and the selected session stored in the URL search params.

## Interface

### Branded Type + Session Schema (`contracts.ts`)

```typescript
class SessionId extends Schema.String.pipe(Schema.brand('SessionId')) {}

class Session extends Schema.Class<Session>('Session')({
	id: SessionId,
	title: Schema.String
}) {}
```

### RPC Contracts (`contracts.ts`)

All existing RPCs gain a `sessionId` in payload. Three new RPCs added.

```typescript
export class RpcContracts extends RpcGroup.make(
	// --- modified ---
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({sessionId: SessionId, message: Prompt.UserMessage}),
		error: AiError.AiError
	}),
	Rpc.make('agent.stop', {
		payload: Schema.Struct({sessionId: SessionId})
	}),
	Rpc.make('agent.events', {
		payload: Schema.Struct({sessionId: SessionId}),
		stream: true,
		error: AiError.AiError,
		success: Schema.Union(/* existing union unchanged */)
	}),
	// --- new ---
	Rpc.make('agent.sessions', {
		stream: true,
		success: Schema.Array(Session)
	}),
	Rpc.make('agent.create', {
		success: SessionId
	}),
	Rpc.make('agent.delete', {
		payload: Schema.Struct({sessionId: SessionId})
	})
) {}
```

### Handler Changes (`handlers.ts`)

```typescript
// Session metadata tracked in a SubscriptionRef
// SubscriptionRef<Session[]> — updated when sessions are created/deleted/titled

const sessionsRef: SubscriptionRef<Session[]>

// RcMap keyed by SessionId (was void)
const conversationRcMap = RcMap.make({
	lookup: (sessionId: string) => Effect.fnUntraced(function* () {
		// same internals: Agent, FiberHandle, makeResumableStream
		// returns { prompt, stop, stream }
	})
})

// Title derivation: on agent.prompt, if session title is empty/default,
// extract first 50 chars of first text part from the user message
// and update sessionsRef

RpcContracts.of({
	'agent.prompt': payload => {
		// 1. get conversation from RcMap.get(rcMap, payload.sessionId)
		// 2. call conversation.prompt([payload.message])
		// 3. derive title from payload.message if session has no title yet
		// 4. update sessionsRef
	},
	'agent.stop': payload => {
		// RcMap.get(rcMap, payload.sessionId) → conversation.stop
	},
	'agent.events': payload => {
		// RcMap.get(rcMap, payload.sessionId) → conversation.stream
	},
	'agent.sessions': () => {
		// SubscriptionRef.changes(sessionsRef)
	},
	'agent.create': () => {
		// generate new SessionId via crypto.randomUUID()
		// append Session({ id, title: 'New chat' }) to sessionsRef
		// return id
	},
	'agent.delete': payload => {
		// filter session out of sessionsRef
		// invalidate RcMap entry if possible (let idle TTL handle cleanup)
	}
})
```

### Route Search Params (`routes/(home)/index.tsx`)

```typescript
export const Route = createFileRoute('/(home)/')({
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			sessionId: Schema.optional(SessionId)
		})
	),
	component: RouteComponent
})
```

### Atoms (`routes/(home)/index.tsx`)

```typescript
// Sessions list — global, always streaming
const sessionsAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.sessions', void 0)),
			Stream.unwrap
		),
		{initialValue: []}
	)
)

// Turns — family keyed by sessionId
const turnsAtom = Atom.family((sessionId: string) =>
	Atom.keepAlive(
		AtomRuntime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('agent.events', {sessionId})),
				Effect.map(partsStreamReducer),
				Effect.map(Stream.map(/* existing turn-building logic */)),
				Stream.unwrap
			),
			{initialValue: []}
		)
	)
)

// sendPrompt and stopAgent also need sessionId parameter
const sendPromptAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* (payload: {sessionId: string; text: string; attachments: File[]}) {
		const client = yield* RpcClient
		yield* client('agent.prompt', {
			sessionId: payload.sessionId,
			message: Prompt.userMessage({
				content: [Prompt.makePart('text', {text: payload.text}), ...(yield* makeFileParts(payload.attachments))]
			})
		})
	})
)

const stopAgentAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* (payload: {sessionId: string}) {
		const client = yield* RpcClient
		yield* client('agent.stop', {sessionId: payload.sessionId})
	})
)

// Create session + navigate
const createSessionAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* () {
		const client = yield* RpcClient.asEffect()
		return yield* client('agent.create', void 0)
	})
)
```

### Layout (`routes/(home)/index.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  ResizablePanelGroup (horizontal)                   │
│ ┌──────────────┐ ║ ┌──────────────────────────────┐ │
│ │  Sidebar      │ ║ │  Conversation (existing)     │ │
│ │  [+ New Chat] │ ║ │  scoped to ?sessionId        │ │
│ │  ─────────── │ ║ │                               │ │
│ │ ● Session A  │ ║ │  (if no sessionId selected,   │ │
│ │   Session B   │ ║ │   show empty state)           │ │
│ │   Session C   │ ║ │                               │ │
│ └──────────────┘ ║ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- Left panel: `ResizablePanel` defaultSize 25%, minSize 15%, maxSize 40%
- `ResizableHandle`
- Right panel: `ResizablePanel` with existing conversation UI
- Sidebar contains:
  - "New Chat" button at top → calls `agent.create`, navigates to `?sessionId=newId`
  - List of sessions from `sessionsAtom`
  - Each row: session title, click → `navigate({search: {sessionId: session.id}})`
  - Delete button (trash icon, like note app) → calls `agent.delete`
  - Selected session highlighted via `sessionId === selectedId`
- Conversation panel:
  - If `sessionId` is present → show `turnsAtom(sessionId)` + input
  - If no `sessionId` → show empty state "Select or create a session"

## Behavior

- **New session**: click "New Chat" → `agent.create` RPC → server generates UUID, adds to session list → returns `SessionId` → client navigates to `?sessionId=id`
- **Session title**: derived from first user message. First 50 chars of first text part. Default: `"New chat"`. Updated server-side on first `agent.prompt` call.
- **Session switching**: click session in sidebar → URL updates → `turnsAtom(newId)` subscribes to that session's event stream. Previous session stays alive server-side (RcMap idle TTL).
- **Session deletion**: removes from `sessionsRef`. If deleted session is selected, navigate to `?sessionId=undefined` (empty state).
- **Stream reconnect**: `turnsAtom` uses `Atom.family` so switching back to a session reuses the existing subscription.
- **Empty state**: no `sessionId` in URL → right panel shows "Select or create a chat"

## Decisions

- **SessionId as branded string** — matches `NoteId` pattern in note app
- **Title from first message** — no manual rename. First 50 chars of first text content part, fallback "New chat"
- **In-memory only** — sessions persist for server lifetime only (no persistence layer). Same as current behavior.
- **SubscriptionRef for session list** — enables streaming the session list to all connected clients
- **Atom.family for turns** — each sessionId gets its own atom, lazily created, supports concurrent subscriptions
- **Note app as reference** — layout, sidebar pattern, URL state, delete flow all mirror `@apps/note`
