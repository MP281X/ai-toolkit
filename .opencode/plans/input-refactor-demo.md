# Goal

- Refactor `packages/components/src/components/input.tsx` to keep roughly the same capabilities and UX while making the implementation simpler, more generic, and less coupled to `@ai-toolkit/ai`.
- Keep using Lexical, but simplify the internal architecture instead of changing the public workflow shape.
- Add a full demo page at `apps/template/src/routes/(home)/input/index.tsx` and expose it from the `(home)` sidebar.

## Decisions

- Keep the current child DSL API:
  - `ChatInput`
  - `Autocomplete`
  - `AutocompleteOption`
  - `Snippets`
  - `Snippet`
  - `Toolbar`
  - `InputActions`
- Keep roughly the same user-facing behavior:
  - plain text editing
  - trigger autocomplete
  - snippet insertion
  - file picker + paste attachments
  - submit on Enter, newline on Shift+Enter
- Remove the AI-specific attachment dependency from `input.tsx`.
- Change `ChatInput` submit payload to:
  - `text: string`
  - `completions: AutocompleteEntry[]`
  - `attachments: File[]`
- Keep `ChatInput` generic. Any mapping to AI `FilePart` happens at the consumer call site.
- Limit AI decoupling scope to the input component. Do not redesign unrelated AI components.
- Demo page should be a full showcase and show a pretty JSON preview of the submitted payload.
- In the demo preview, attachments should be shown as metadata only, not base64 contents.

## Refactor Scope

- Update `packages/components/src/components/input.tsx`.
- Update the existing chat demo at `apps/template/src/routes/(home)/chat/index.tsx` to convert `File[]` into AI `FilePart` values before calling `sendMessage`.
- Replace the placeholder route at `apps/template/src/routes/(home)/input/index.tsx` with a complete demo.
- Update `apps/template/src/routes/(home)/route.tsx` to add the input demo to the sidebar.

## Component Changes

- Remove this dependency from the input component:
  - `import {type FilePart, FilePart as FilePartSchema} from '@ai-toolkit/ai/schema'`
- Replace attachment state from AI payload objects to native browser `File` instances.
- Remove base64 encoding work from `ChatInput`.
- Keep Lexical-based token insertion for autocomplete items and attached files so the editor still feels structured and pleasant to use.
- Simplify internal code around:
  - attachment handling
  - submit payload assembly
  - controlled/uncontrolled value sync
  - child parsing and menu state where possible
- Preserve the current visual behavior and interaction quality unless a simplification clearly improves clarity without reducing capability.

## Chat Route Changes

- In `apps/template/src/routes/(home)/chat/index.tsx`, keep `ChatInput` generic.
- Convert submitted `File[]` attachments into AI `FilePart` objects locally in the route before calling `sendMessage`.
- The route should continue sending:
  - one `TextPart`
  - followed by converted AI file parts
- File conversion should include:
  - reading each `File`
  - base64 encoding
  - mapping file metadata to AI schema fields

## Input Demo Page

- Build a full showcase in `apps/template/src/routes/(home)/input/index.tsx`.
- Demonstrate:
  - autocomplete triggers
  - snippets
  - toolbar content
  - extra actions
  - file attachments via picker and paste
  - controlled or semi-controlled usage if useful for DX demonstration
- Show the latest submitted payload in the top section as formatted JSON.
- For attachment preview inside the JSON block, serialize files as metadata only:
  - `name`
  - `type`
  - `size`
  - `lastModified`
- The page should clearly show what `ChatInput` returns to consumers.

## Sidebar Update

- Add the input demo page to `apps/template/src/routes/(home)/route.tsx`.
- Follow the existing sidebar pattern:
  - `TreeExplorerItem`
  - `navigate({to: '/input'})`
  - `selected={isCurrentPage('/input')}`
  - use an existing icon from `@ai-toolkit/components/icons`

## Constraints

- Do not redesign the public workflow structure beyond the agreed API changes.
- Do not remove the child DSL.
- Do not move AI-specific logic back into `ChatInput`.
- Keep the implementation aligned with repo rules:
  - local and explicit code
  - no speculative generic helpers
  - preserve good UX first

## Validation

- Run in order:
  - `bun run fix`
  - `bun run check`
