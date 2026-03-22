import {pipe, Schema} from 'effect'

import {Response, Tool, Toolkit} from 'effect/unstable/ai'
import {HttpClient} from 'effect/unstable/http/HttpClient'

export const WebSearchToolKit = Toolkit.make(
	Tool.make('WebSearch', {
		description: 'Search the web for recent, relevant sources and return concise page content snippets.',
		parameters: Schema.Struct({
			query: pipe(
				Schema.NonEmptyString,
				Schema.annotate({description: 'The search query to send to the web search provider.'})
			),
			numResults: pipe(
				Schema.Int,
				Schema.optionalKey,
				Schema.check(Schema.isGreaterThan(0)),
				Schema.annotate({description: 'Optional maximum number of search results to return.'})
			)
		}),
		success: Schema.Array(
			Schema.Struct({
				title: Schema.NullOr(Schema.NonEmptyString),
				url: Schema.NonEmptyString,
				text: Schema.NonEmptyString,
				highlights: Schema.Array(Schema.String)
			})
		)
	}).annotate(Tool.Strict, true)
)

export const WebFetchToolKit = Toolkit.make(
	Tool.make('WebFetch', {
		dependencies: [HttpClient],
		description:
			'Fetch content from a specified URL, convert it to text, markdown, or HTML, and return the normalized result.',
		parameters: Schema.Struct({
			url: pipe(
				Schema.URLFromString,
				Schema.annotate({description: 'The URL to fetch content from. HTTP URLs are automatically upgraded to HTTPS.'})
			),
			format: pipe(
				Schema.Literals(['text', 'markdown', 'html']),
				Schema.optionalKey,
				Schema.withDecodingDefaultKey(() => 'markdown' as const),
				Schema.annotate({description: 'The format to return the fetched content in. Defaults to markdown.'})
			)
		}),
		success: Schema.Struct({
			title: Schema.NonEmptyString,
			output: Schema.String,
			attachments: Schema.Array(Response.FilePart)
		})
	}).annotate(Tool.Strict, true)
)

export const AgentToolKit = Toolkit.merge(WebSearchToolKit, WebFetchToolKit)
