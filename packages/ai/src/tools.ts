import {Config, Effect, String} from 'effect'

import {AiError} from 'effect/unstable/ai'
import Exa from 'exa-js'

import {ToolKit} from './schema.ts'

export const ToolKitLayer = ToolKit.toLayer(
	Effect.gen(function* () {
		const exa = new Exa(yield* Config.string('AI_EXA'))

		return ToolKit.of({
			WebSearch: ({numResults, query}) =>
				Effect.tryPromise({
					try: async () => {
						// biome-ignore lint/plugin: exa-js method
						const response = await exa.search(query, {
							contents: {highlights: true, text: true},
							numResults
						})

						return response.results
					},
					catch: cause => new AiError.UnknownError({description: `web search failed: ${String.String(cause)}`})
				})
		})
	})
)
