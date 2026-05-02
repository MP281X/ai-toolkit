import {Array, Config, Effect, String} from 'effect'

import {AiError} from 'effect/unstable/ai'
import Exa from 'exa-js'

import {WebFetchToolKit, WebSearchToolKit} from './contracts.ts'

export const WebSearchToolKitLayer = WebSearchToolKit.toLayer(
	Effect.gen(function* () {
		const exa = new Exa(yield* Config.string('AI_EXA'))

		return WebSearchToolKit.of({
			web_search: params =>
				Effect.tryPromise({
					try: async () => {
						const response = await exa.search(params.query, {
							contents: {highlights: true, text: true},
							numResults: params.numResults
						})

						return response.results
					},
					catch: cause => new AiError.UnknownError({description: `web search failed: ${String.String(cause)}`})
				})
		})
	})
)

export const WebFetchToolKitLayer = WebFetchToolKit.toLayer(
	Effect.gen(function* () {
		const exa = new Exa(yield* Config.string('AI_EXA'))

		return WebFetchToolKit.of({
			web_fetch: params =>
				Effect.tryPromise({
					try: async () => {
						const response = await exa.getContents(
							Array.map(params.urls, url => url.toString()),
							{text: true, highlights: true}
						)

						return response.results
					},
					catch: cause => new AiError.UnknownError({description: `web fetch failed: ${String.String(cause)}`})
				})
		})
	})
)
