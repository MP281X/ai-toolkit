import {pipe, Schema} from 'effect'

import {Tool, Toolkit} from 'effect/unstable/ai'
import {AiError} from 'effect/unstable/ai/AiError'

export const WebSearchToolKit = Toolkit.make(
	Tool.make('web_search', {
		failure: AiError,
		failureMode: 'return',
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
				highlights: Schema.Array(Schema.NonEmptyString)
			})
		)
	}).annotate(Tool.Strict, true)
)

export const WebFetchToolKit = Toolkit.make(
	Tool.make('web_fetch', {
		failure: AiError,
		failureMode: 'return',
		description: 'Fetch clean text content from specified URLs using Exa.',
		parameters: Schema.Struct({
			urls: pipe(
				Schema.Array(Schema.URLFromString),
				Schema.check(Schema.isNonEmpty()),
				Schema.annotate({description: 'Array of URLs to fetch content from.'})
			)
		}),
		success: Schema.Array(
			Schema.Struct({
				title: Schema.NullOr(Schema.NonEmptyString),
				url: Schema.NonEmptyString,
				text: Schema.NonEmptyString,
				highlights: Schema.Array(Schema.NonEmptyString)
			})
		)
	}).annotate(Tool.Strict, true)
)

export const AgentToolKit = Toolkit.merge(WebSearchToolKit, WebFetchToolKit)
