import {Config, Effect, Schema} from 'effect'

import {type ToolSet, tool} from 'ai'
import Exa from 'exa-js'

import {WebToolInput, WebToolOutput, WebToolSource} from '../tools.ts'

export const webSearchToolSet = Effect.gen(function* () {
	const exa = new Exa(yield* Config.string('AI_EXA'))

	return {
		web_search: tool({
			description:
				'Search the web for up-to-date information. Returns a short list of results with url, title, publishedDate and excerpted text.',
			inputSchema: Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(WebToolInput)),
			execute: async input => {
				const response = await exa.searchAndContents(input.query ?? input.url ?? '', {
					numResults: 3,
					livecrawl: 'always',
					text: {maxCharacters: 1000}
				})

				return WebToolOutput.makeUnsafe({
					provider: 'exa',
					query: input.query,
					sources: response.results.map(result =>
						WebToolSource.makeUnsafe({
							publishedDate: result.publishedDate,
							text: result.text,
							title: result.title ?? undefined,
							url: result.url
						})
					)
				})
			}
		})
	} satisfies ToolSet
})
