import {Array, Config, Effect} from 'effect'

import {tool} from 'ai'
import Exa from 'exa-js'
import {z} from 'zod'

export type WebSearchResult = {
	url: string
	title?: string
	text?: string
	query: string
}

const dedupeByUrl = (results: WebSearchResult[]) => {
	const seen = new Set<string>()

	return Array.filter(results, result => {
		if (seen.has(result.url)) return false
		seen.add(result.url)
		return true
	})
}

const searchInputSchema = z.object({
	queries: z.array(z.string()).min(3).max(5),
	numResults: z.number().int().positive().optional(),
	useAutoprompt: z.boolean().optional(),
	type: z.enum(['neural', 'keyword']).optional(),
	textMaxCharacters: z.number().int().positive().optional()
})

export const webSearchTool = tool({
	description:
		'Web search via Exa. Use 3-5 queries with time context. Returns deduped results with URL, title, text, and query.',
	inputSchema: searchInputSchema,
	execute: async input => {
		const apiKey = await Effect.runPromise(Config.string('AI_EXA_API_KEY'))
		const exa = new Exa(apiKey)
		const numResults = input.numResults ?? 10
		const useAutoprompt = input.useAutoprompt ?? true
		const type = input.type ?? 'neural'
		const textMaxCharacters = input.textMaxCharacters ?? 3000

		const results = await Promise.all(
			input.queries.map(async query => {
				const response = await exa.searchAndContents(query, {
					type,
					numResults,
					useAutoprompt,
					text: {maxCharacters: textMaxCharacters}
				})

				return response.results.map(result => ({
					url: result.url,
					title: result.title ?? undefined,
					text: result.text ?? undefined,
					query
				}))
			})
		)

		return {results: dedupeByUrl(results.flat())}
	}
})
