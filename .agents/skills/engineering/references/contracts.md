# Contract shape

## Boundary schema owns data

```ts
// BAD
const State = Schema.Literal('open', 'done')

// GOOD
type State = typeof State.Type
const State = Schema.Literals(['open', 'done'])
```

```ts
// BAD
export interface CreateNote {
	text: string
}

export const CreateNote = Schema.Struct({text: Schema.String})

// GOOD
export type CreateNote = typeof CreateNote.Type
export const CreateNote = Schema.Struct({text: Schema.Trim})
```

One schema/type pair owns boundary shape, defaults, transformations, and validation.

## Service owns its interface; implementation conforms

```ts
// BAD: service.ts
type NotesShape = {create: (input: CreateNote) => Effect.Effect<Note, NoteError>}

export class Notes extends Context.Service<Notes, NotesShape>()('Notes', {
	make: Effect.succeed({create: input => repository.create(input)})
}) {}

// GOOD: service.ts
import {makeMemory} from './internal/memory.ts'

export class Notes extends Context.Service<Notes, {create: (input: CreateNote) => Effect.Effect<Note, NoteError>}>()(
	'Notes'
) {
	static layerMemory = Layer.effect(this, makeMemory)
}

// GOOD: internal/memory.ts
export const makeMemory = Effect.gen(function* () {
	const repository = yield* Repository

	return Notes.of({create: input => repository.create(input)})
})
```

The class owns the sole public interface and every named Layer. Constructors infer requirements, errors, and output through `Service.of`.

## Source

- `.agents/repos/effect/packages/effect/src/Schema.ts`
- `.agents/repos/effect/packages/effect/src/Context.ts`
- `.agents/repos/effect/packages/effect/src/Layer.ts`
- `.agents/repos/react/packages/react/src/ReactHooks.js`
