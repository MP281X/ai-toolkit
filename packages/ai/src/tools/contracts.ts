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
				Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
				Schema.optionalKey,
				Schema.annotate({description: 'Optional maximum number of search results to return.'})
			)
		}),
		success: Schema.Array(
			Schema.Struct({
				title: pipe(
					Schema.NullOr(Schema.NonEmptyString),
					Schema.annotate({description: 'The page title, when one was available from the search provider.'})
				),
				url: pipe(Schema.NonEmptyString, Schema.annotate({description: 'The canonical URL of the search result.'})),
				text: pipe(
					Schema.NonEmptyString,
					Schema.annotate({description: 'The extracted page content snippet returned for the result.'})
				),
				highlights: pipe(
					Schema.Array(Schema.String),
					Schema.annotate({description: 'Short highlighted excerpts relevant to the query.'})
				)
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
			title: pipe(
				Schema.NonEmptyString,
				Schema.annotate({description: 'A human-readable title for the fetched resource.'})
			),
			output: pipe(
				Schema.String,
				Schema.annotate({
					description: 'The fetched content converted to the requested format, or a short attachment status message.'
				})
			),
			attachments: pipe(
				Schema.Array(Response.FilePart),
				Schema.annotate({description: 'Binary attachments returned when the fetched resource is not text-based.'})
			)
		})
	}).annotate(Tool.Strict, true)
)

export const AgentToolKit = Toolkit.merge(WebSearchToolKit, WebFetchToolKit)
