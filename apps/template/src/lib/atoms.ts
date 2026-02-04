import {FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse} from '@effect/platform'
import {Predicate, pipe, Stream} from 'effect'

import {AccumulateTextStream, type TextStreamPart} from '@ai-toolkit/ai'
import {Atom} from '@effect-atom/atom-react'

export const AtomRuntime = Atom.runtime(FetchHttpClient.layer)

export const llmStreamAtom = AtomRuntime.fn(() =>
	pipe(
		HttpClientRequest.get(`${import.meta.env['VITE_CONVEX_SITE_URL']}/llm`),
		HttpClient.execute,
		HttpClientResponse.stream,
		Stream.decodeText('utf-8'),
		Stream.splitLines,
		Stream.map((line: string) => {
			if (!line.startsWith('data: ')) return undefined
			const json = line.slice(6)
			return JSON.parse(json) as TextStreamPart<never>
		}),
		Stream.filter(Predicate.isNotUndefined),
		AccumulateTextStream
	)
)
