import {Config, Effect, Schema} from 'effect'

import {type ToolSet, tool} from 'ai'
import Exa from 'exa-js'

export const webSearchToolSet = Effect.gen(function* () {
	const exa = new Exa(yield* Config.string('AI_EXA'))

	return {
		web_search: tool({
			description: `
      Search the web for up-to-date information. Returns a short list of results with url, title, publishedDate and excerpted text.
      `,
			inputSchema: Schema.toStandardSchemaV1(
				Schema.toStandardJSONSchemaV1(
					Schema.Struct({
						query: Schema.NonEmptyString
					})
				)
			),
			execute: async input => {
				const response = await exa.searchAndContents(input.query, {
					numResults: 3,
					livecrawl: 'always',
					text: {maxCharacters: 1000}
				})

				return {
					provider: 'exa',
					query: input.query,
					results: response.results.map(result => ({
						title: result.title,
						url: result.url,
						publishedDate: result.publishedDate,
						text: result.text
					}))
				}
			}
		})
	} satisfies ToolSet
})
