import {Array, Duration, Effect, flow, Option, pipe, RcMap, Schema, Stream, String, SubscriptionRef} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import {partsStreamReducer} from '@ai-toolkit/ai/utils'
import {Prompt} from 'effect/unstable/ai'
import {KeyValueStore} from 'effect/unstable/persistence'

import type {NoteId} from '#rpcs/contracts.ts'
import {Note, NoteError, RpcContracts} from '#rpcs/contracts.ts'

function extractTitle(parts: readonly Note['parts'][number][]) {
	const text = pipe(
		parts,
		Array.reduce('', (text, part) => {
			if (Prompt.isMessage(part)) return text
			if (part.type !== 'text-delta') return text
			return `${text}${part.delta}`
		})
	)

	return pipe(
		text,
		String.match(/^#\s+(.+)$/m),
		Option.map(match => pipe(match.at(1) ?? '', String.trim)),
		Option.filter(String.isNonEmpty),
		Option.getOrElse(() => {
			const fallback = pipe(text, String.trim, String.slice(0, 50), String.trim)
			if (String.isNonEmpty(fallback)) return fallback
			return 'Generating…'
		})
	)
}

const noteSystemMessage = Prompt.systemMessage({
	content: `
You are a note-taking assistant. Your job is to transform scattered, messy user input into clean, well-structured, searchable markdown notes.

INPUT:
- User text (may contain fragmented thoughts, ideas, observations)
- References to external content (links to videos, articles, posts) that you can fetch
- Files (images, documents) that the user has attached

OUTPUT FORMAT:
Start with a single H1 heading (# Title) that clearly describes the note's topic. Then write the content as clean markdown.

GUIDELINES:
- Organize scattered thoughts into logical flow - group related ideas, create structure
- Use bullet points for lists, short paragraphs for narrative
- Clean up grammar and formatting while preserving all information
- If user references external content, incorporate key insights naturally into the note
- Do NOT list files or sources separately - the UI already shows them
- Write for future searchability - be specific, use clear language, include relevant keywords
- Keep it concise but complete - this is a reference note, not an essay

The user should be able to quickly scan this note and find what they're looking for.`
})

const noteRcMap = RcMap.make({
	lookup: Effect.fnUntraced(function* () {
		const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Schema.Array(Note))
		const notes = yield* pipe(store.get('notes'), Effect.map(Option.getOrElse<readonly Note[]>(() => [])))
		const ref = yield* SubscriptionRef.make(notes)

		yield* Effect.forkScoped(
			pipe(
				SubscriptionRef.changes(ref),
				Stream.debounce(Duration.millis(100)),
				Stream.runForEach(notes => store.set('notes', notes))
			)
		)

		return {
			list: SubscriptionRef.changes(ref),
			upsert: Effect.fnUntraced(function* (note: Note) {
				yield* SubscriptionRef.update(ref, notes =>
					pipe(
						Array.findFirstIndex(notes, current => current.id === note.id),
						Option.match({
							onNone: () => Array.append(notes, note),
							onSome: flow(
								index => Array.replace(notes, index, note),
								Option.getOrElse(() => notes)
							)
						})
					)
				)
			}),
			remove: (id: NoteId) => SubscriptionRef.update(ref, notes => Array.filter(notes, note => note.id !== id))
		}
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const notesRepo = yield* RcMap.get(yield* noteRcMap, void 0)

		return RpcContracts.of({
			'note.create': flow(
				Effect.fnUntraced(function* (payload) {
					const note = new Note({title: 'thinking…', parts: []})
					yield* notesRepo.upsert(note)

					yield* pipe(
						Agent.useSync(agent => agent.streamText([noteSystemMessage, payload])),
						Stream.unwrap,
						partsStreamReducer,
						Stream.runForEach(parts => notesRepo.upsert(new Note({id: note.id, title: extractTitle(parts), parts}))),
						Effect.provide(Agent.layer),
						Effect.provide(Agent.resolveLanguageModel({provider: 'openrouter', model: 'openai/gpt-5.4-nano'})),
						Effect.forkDetach
					)

					return note.id
				}),
				Effect.mapError(cause => new NoteError({cause}))
			),
			'note.list': () => notesRepo.list,
			'note.delete': flow(
				id => notesRepo.remove(id),
				Effect.mapError(cause => new NoteError({cause}))
			)
		})
	})
)
