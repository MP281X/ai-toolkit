import {Config, Effect} from 'effect'

import {type ToolSet, tool} from 'ai'
import Exa from 'exa-js'
import {z} from 'zod'

export const webSearchToolSet = Effect.gen(function* () {
	const exa = new Exa(yield* Config.string('AI_EXA'))

	return {
		web_search: tool({
			description: `
      Search the web for up-to-date information. Returns a short list of results with url, title, publishedDate and excerpted text.
      `,
			inputSchema: z.object({query: z.string().min(1)}),
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
