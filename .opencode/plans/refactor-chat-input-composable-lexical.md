# Goal

- Refactor `@packages/components/src/components/input.tsx` into a more composable, Lexical-native chat input that keeps the current visual style very close to today.
- Preserve the current core behaviors:
  - plain-text chat editing
  - paste/select file attachments
  - snippet insertion
  - multiple trigger-based shortcuts/autocomplete systems
  - submit payload shape: `{text, completions, attachments}`
- Make each feature opt-in and independently composable so different screens can assemble different input UIs without forking the component.
- Add a runnable demo page in the template app that shows the exact object sent to `onSubmit` when Send is pressed, and simplify the chat route to a minimal example that still uses the input.

## Decisions

- A breaking public API change is allowed.
- The new public API should use compound slots/components rather than one monolithic component.
- Internals should use structured Lexical nodes, commands, and plugins instead of `matchText` string bookkeeping.
- The parent will pass already-loaded trigger/autocomplete items; those lists may update over time and the input must react to updates live.
- The visual language should stay very close to the current component.
- Attachment scope stays at current behavior only: paste files/images and attach via file picker.

## Public API Shape

- Replace the current child-parsing config API with explicit compound components.
- Target shape:

```text
ChatInput.Root
├─ ChatInput.Editor
├─ ChatInput.Autocomplete
│  └─ ChatInput.Trigger
├─ ChatInput.Footer
│  ├─ ChatInput.Toolbar
│  └─ ChatInput.Actions
├─ ChatInput.AttachButton
├─ ChatInput.SnippetButton
└─ ChatInput.SubmitButton
```

- `ChatInput.Root` owns shared state, submit behavior, and Lexical wiring.
- `ChatInput.Editor` renders the editable surface and placeholder.
- `ChatInput.Footer` preserves the current footer layout.
- `ChatInput.Toolbar` holds left-side controls such as model selection.
- `ChatInput.Actions` holds right-side custom actions.
- `ChatInput.AttachButton`, `ChatInput.SnippetButton`, and `ChatInput.SubmitButton` are small convenience components wired to context/commands.
- `ChatInput.Autocomplete` and `ChatInput.Trigger` define one generic trigger system that can support `@`, `/`, `:`, or any other trigger character.

## Internal Architecture

- Split the monolith into four layers:

### 1. Shell

- Keep the current border, spacing, footer, and overall layout.
- Reuse local component patterns and primitives already present in `packages/components`:
  - `InputGroup`-style slot composition
  - `Popover` for anchored menus if positioning is extracted
  - existing `Button` styling for snippet/attach/submit actions

### 2. Lexical editor core

- Keep `LexicalComposer` + `PlainTextPlugin` as the editing base.
- Move behavior into focused Lexical plugins instead of keeping everything in one component:
  - editor sync/update plugin
  - keyboard plugin
  - trigger detection/autocomplete plugin
  - attachment paste/file plugin
- Use official Lexical extension points that were verified:
  - `KEY_ENTER_COMMAND`
  - `KEY_DOWN_COMMAND`
  - `PASTE_COMMAND`
  - custom commands via `createCommand(...)`

### 3. Structured node model

- Replace ref-based `completionsRef` / `attachmentsRef` tracking with Lexical nodes as the source of truth.
- Use custom inline token-style nodes for text-like atomic entities.
- Introduce dedicated node types for:
  - trigger selections / autocomplete picks
  - attachments
- Store the metadata required for submit directly on those nodes so the submit payload can be derived from the editor state.
- Keep visible text behavior compatible with plain-text editing and submission.

### 4. Commands and context

- Expose internal actions as commands rather than direct component-local mutations.
- Add commands for at least:
  - submit
  - insert trigger item
  - insert snippet
  - insert attachments
  - dismiss autocomplete
- Put shared editor state and feature registration behind `ChatInput` context so slot components can stay small and local.

## Behavior Requirements

### Submit

- Keep the external submit contract unchanged:
  - `text`
  - `completions`
  - `attachments`
- At submit time:
  - read plain text from the Lexical root
  - traverse the editor tree
  - collect structured metadata from custom nodes
- Do not reconstruct metadata by searching text substrings.

### Triggers / autocomplete

- Support multiple trigger definitions at once.
- Each trigger should accept a live item list from the parent.
- When the parent updates the item list, the menu and matching logic must use the latest data without remounting the whole editor.
- Trigger insertion should create a structured node, not plain text plus side refs.
- Menu keyboard behavior should stay aligned with the current component:
  - `Enter` selects when menu is open
  - `Escape` dismisses
  - arrow keys move selection

### Snippets

- Snippets should be exposed as buttons/components, not a parsed hidden config tree.
- Snippet insertion should go through a command so snippets can be rendered anywhere in the composed shell.
- Preserve multiline insertion behavior.

### Attachments

- Preserve paste handling for files/images.
- Preserve file picker attachment behavior.
- Convert selected files into `FilePart` values as today.
- Insert structured attachment nodes into the editor so attachment metadata lives in the document, not in external refs.

### Controlled and uncontrolled usage

- Preserve support for both:
  - internal state usage
  - controlled `value` / `onValueChange` usage
- Keep synchronization explicit and local.
- Avoid resetting structured nodes accidentally when controlled text updates occur.

## Refactor Steps

### 1. Separate shell from behavior

- Extract the current layout into slot-based UI pieces while keeping the rendered look nearly identical.
- Remove the runtime `parseChildren(...)` configuration path.

### 2. Introduce Lexical commands and focused plugins

- Move keyboard, update, and paste logic into dedicated renderless plugins.
- Replace direct local handlers with commands/context entry points.

### 3. Replace ref bookkeeping with structured nodes

- Introduce custom node types for trigger tokens and attachments.
- Store submit metadata on nodes.
- Make submit derive all metadata by reading the current editor state.

### 4. Rebuild trigger system around live config

- Replace child parsing with explicit trigger registration/components.
- Ensure matching works with parent-driven item list updates.

### 5. Rebuild snippet and action composition

- Turn snippets into normal slot components/buttons.
- Keep toolbar/actions as dedicated slots rather than hidden config children.

### 6. Migrate the existing usage

- Update `apps/template/src/routes/(home)/chat/index.tsx` to the new compound API.
- Preserve the existing model selector placement and snippet buttons.

## Risks to Avoid

- Do not keep `matchText`-based metadata reconstruction.
- Do not design the new API around one hard-coded footer/action layout; composition must stay flexible.
- Do not make trigger config static at mount time.
- Do not lose controlled-mode support.
- Do not drift visually from the current component unless required by composition constraints.

## Validation

- Confirm the existing chat route still supports:
  - typing plain text
  - inserting snippets
  - attaching files via picker
  - pasting files/images
  - submitting the expected payload shape
- Confirm trigger menus respond to parent-provided list updates.
- Run repository validation in the required order:
  1. `bun run fix`
  2. `bun run check`

## Examples

- The migrated usage should read like explicit composition rather than hidden config parsing.
- Representative shape:

```text
<ChatInput.Root onSubmit={...}>
  <ChatInput.Editor placeholder="Send a message..." />
  <ChatInput.Autocomplete>
    <ChatInput.Trigger trigger="@" items={...} />
    <ChatInput.Trigger trigger="/" items={...} />
  </ChatInput.Autocomplete>
  <ChatInput.Footer>
    <ChatInput.Toolbar>...</ChatInput.Toolbar>
    <ChatInput.Actions>
      <ChatInput.SnippetButton ... />
      <ChatInput.AttachButton />
      <ChatInput.SubmitButton />
    </ChatInput.Actions>
  </ChatInput.Footer>
</ChatInput.Root>
```

## Template demo & chat simplification

- Goal: add a runnable demo inside the template app that shows what object the input sends when "Send" is pressed, and simplify the current chat route to a minimal example that still uses the input component.
- Decisions for this addition:
  - The demo page lives in the example app: `apps/template/src/routes/(home)/input/index.tsx` (there is already a placeholder file).
  - The sidebar (`apps/template/src/routes/(home)/route.tsx`) should expose a navigation entry to `/input` so the demo is discoverable.
  - The chat route should be simplified by removing the ModelSelector and Snippets; it will keep a placeholder Conversation area and a minimal ChatInput usage wired to local state.
  - The demo can be implemented either against the current ChatInput API (fast) or against the post-refactor API. Since you preferred "wait for refactor" earlier, the plan assumes the demo will be implemented after the ChatInput refactor, but includes a pre-refactor snippet for quick testing if desired.

Files to change (plan-only):
- `apps/template/src/routes/(home)/input/index.tsx` (demo page)
- `apps/template/src/routes/(home)/route.tsx` (add sidebar entry)
- `apps/template/src/routes/(home)/chat/index.tsx` (simplify)

Minimal pre-refactor demo (optional, works with current ChatInput signature):

```tsx
// apps/template/src/routes/(home)/input/index.tsx
import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import {ChatInput} from '@ai-toolkit/components/input'

export const Route = createFileRoute('/(home)/input/')({ component: RouteComponent })

function RouteComponent() {
  const [log, setLog] = useState<any[]>([])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs">{JSON.stringify(log[log.length - 1] ?? {}, null, 2)}</pre>
      </div>
      <ChatInput
        onSubmit={payload => setLog(prev => [...prev, payload])}
        placeholder="Demo: type and press send"
      />
    </div>
  )
}
```

Note: the `onSubmit` signature expected by the current ChatInput is
`(payload: {text: string; completions: AutocompleteEntry[]; attachments: FilePart[]}) => void` — the demo surface should render that object directly.

Minimal route.tsx sidebar update (insert an Input entry after Chat):

```diff
@@
   <TreeExplorerItem
     onClick={() => navigate({to: '/chat'})}
     selected={isCurrentPage('/chat')}
     icon={<MessageSquare className="size-3.5" />}
   >
     Chat
   </TreeExplorerItem>
+
+  <TreeExplorerItem
+    onClick={() => navigate({to: '/input'})}
+    selected={isCurrentPage('/input')}
+    icon={<MessageSquare className="size-3.5" />}
+  >
+    Input
+  </TreeExplorerItem>
```

Minimal simplified chat route (replace `apps/template/src/routes/(home)/chat/index.tsx`):

```tsx
import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import {ChatInput} from '@ai-toolkit/components/input'

export const Route = createFileRoute('/(home)/chat/')({ component: RouteComponent })

function RouteComponent() {
  const [messages, setMessages] = useState<any[]>([])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        {messages.map((m, i) => (
          <pre key={i} className="mb-2 text-xs">{JSON.stringify(m, null, 2)}</pre>
        ))}
      </div>

      <ChatInput onSubmit={payload => setMessages(prev => [...prev, payload])} />
    </div>
  )
}
```

Migration notes (post-refactor):
- If ChatInput becomes a compound API, the demo and chat pages should be updated to the new composition (example in the main plan's Examples section). Keep the demo's assertion (display the `onSubmit` object) identical.

Validation steps (plan-only):
1. After implementing the demo or simplification, run `bun run fix` and `bun run check`.
2. Start the template app and verify the Input entry appears in the sidebar and the `/input` page shows the demo.
3. On the demo page, type and press Send; confirm the JSON object shown reflects the object passed to `onSubmit`.
4. On the simplified chat route, verify messages append locally when sending.
