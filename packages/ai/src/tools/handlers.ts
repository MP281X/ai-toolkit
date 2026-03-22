import {Config, Effect, Option, pipe, String} from 'effect'

import {AiError, Response} from 'effect/unstable/ai'
import {HttpClient, HttpClientResponse} from 'effect/unstable/http'
import Exa from 'exa-js'

import {WebFetchToolKit, WebSearchToolKit} from './contracts.ts'

const accepts = {
	markdown: 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1',
	text: 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1',
	html: 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1'
} as const

function decodeEntities(html: string) {
	return pipe(
		html,
		String.replace(/&nbsp;/gi, ' '),
		String.replace(/&amp;/gi, '&'),
		String.replace(/&lt;/gi, '<'),
		String.replace(/&gt;/gi, '>'),
		String.replace(/&quot;/gi, '"'),
		String.replace(/&#39;/gi, "'"),
		String.replace(/\r/g, '')
	)
}

function htmlToText(html: string) {
	return pipe(
		html,
		String.replace(/<!--[\s\S]*?-->/g, ''),
		String.replace(
			/<(script|style|noscript|iframe|object|embed)[^>]*>[\s\S]*?<\/(script|style|noscript|iframe|object|embed)>/gi,
			''
		),
		String.replace(/<br\s*\/?>/gi, '\n'),
		String.replace(
			/<\/(p|div|section|article|main|header|footer|aside|nav|ul|ol|table|tr|h1|h2|h3|h4|h5|h6)>/gi,
			'\n\n'
		),
		String.replace(/<li[^>]*>/gi, '- '),
		String.replace(/<\/li>/gi, '\n'),
		String.replace(/<[^>]+>/g, ''),
		decodeEntities,
		String.replace(/[ \t]+\n/g, '\n'),
		String.replace(/\n[ \t]+/g, '\n'),
		String.replace(/\n{3,}/g, '\n\n'),
		String.replace(/[ \t]{2,}/g, ' '),
		String.trim
	)
}

function htmlToMarkdown(html: string) {
	return pipe(
		pipe(
			html,
			String.replace(/<!--[\s\S]*?-->/g, ''),
			String.replace(
				/<(script|style|noscript|iframe|object|embed)[^>]*>[\s\S]*?<\/(script|style|noscript|iframe|object|embed)>/gi,
				''
			),
			String.replace(/<br\s*\/?>/gi, '\n'),
			String.replace(/<h1[^>]*>/gi, '# '),
			String.replace(/<h2[^>]*>/gi, '## '),
			String.replace(/<h3[^>]*>/gi, '### '),
			String.replace(/<h4[^>]*>/gi, '#### '),
			String.replace(/<h5[^>]*>/gi, '##### '),
			String.replace(/<h6[^>]*>/gi, '###### '),
			String.replace(/<\/(h1|h2|h3|h4|h5|h6)>/gi, '\n\n'),
			String.replace(/<strong[^>]*>|<b[^>]*>/gi, '**'),
			String.replace(/<\/(strong|b)>/gi, '**'),
			String.replace(/<em[^>]*>|<i[^>]*>/gi, '*'),
			String.replace(/<\/(em|i)>/gi, '*'),
			String.replace(/<code[^>]*>/gi, '`'),
			String.replace(/<\/code>/gi, '`'),
			String.replace(/<pre[^>]*>/gi, '\n```\n'),
			String.replace(/<\/pre>/gi, '\n```\n')
		),
		String.replace(/<blockquote[^>]*>/gi, '> '),
		String.replace(/<\/blockquote>/gi, '\n\n'),
		String.replace(/<li[^>]*>/gi, '- '),
		String.replace(/<\/li>/gi, '\n'),
		String.replace(/<\/(p|div|section|article|main|header|footer|aside|nav|ul|ol|table|tr)>/gi, '\n\n'),
		String.replace(/<[^>]+>/g, ''),
		decodeEntities
	)
}

export const WebSearchToolKitLayer = WebSearchToolKit.toLayer(
	Effect.gen(function* () {
		const exa = new Exa(yield* Config.string('AI_EXA'))

		return WebSearchToolKit.of({
			WebSearch: params =>
				Effect.tryPromise({
					try: async () => {
						// biome-ignore lint/plugin: exa-js method
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
		return WebFetchToolKit.of({
			WebFetch: Effect.fnUntraced(function* (params, _context) {
				const format = pipe(
					Option.fromUndefinedOr(params.format),
					Option.getOrElse(() => 'markdown' as const)
				)

				const response = yield* pipe(
					HttpClient.get(params.url, {
						accept: accepts[format],
						headers: {
							'user-agent':
								'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
							'accept-language': 'en-US,en;q=0.9'
						}
					}),
					Effect.andThen(HttpClientResponse.filterStatusOk),
					Effect.mapError(e => new AiError.UnknownError({description: `web fetch failed: ${String.String(e)}`}))
				)

				const bytes = yield* pipe(
					response.arrayBuffer,
					Effect.map(buf => new Uint8Array(buf)),
					Effect.mapError(e => new AiError.UnknownError({description: `web fetch failed: ${String.String(e)}`}))
				)

				if (bytes.byteLength > 5 * 1024 * 1024) {
					return yield* new AiError.UnknownError({description: 'web fetch response too large (exceeds 5MB limit)'})
				}

				const contentType = pipe(
					Option.fromUndefinedOr(response.headers['content-type']),
					Option.map(String.trim),
					Option.getOrElse(() => '')
				)

				const mime = pipe(
					contentType,
					String.split(';'),
					Option.fromIterable,
					Option.map(String.trim),
					Option.map(String.toLowerCase),
					Option.getOrElse(() => '')
				)

				const title = `${params.url.toString()} (${String.isEmpty(contentType) ? 'unknown' : contentType})`

				if (
					!(String.isEmpty(mime) || String.startsWith('text/')(mime)) &&
					mime !== 'application/json' &&
					mime !== 'application/xml' &&
					mime !== 'application/xhtml+xml' &&
					mime !== 'application/javascript' &&
					mime !== 'image/svg+xml'
				) {
					return {
						title,
						output: 'Binary content fetched successfully',
						attachments: [
							Response.makePart('file', {
								mediaType: String.isEmpty(mime) ? 'application/octet-stream' : mime,
								data: bytes
							})
						]
					}
				}

				const content = new TextDecoder().decode(bytes)
				const isHtmlMime = mime === 'text/html' || mime === 'application/xhtml+xml'

				if (format === 'html') return {title, output: content, attachments: []}
				if (format === 'text') return {title, output: isHtmlMime ? htmlToText(content) : content, attachments: []}
				return {title, output: isHtmlMime ? htmlToMarkdown(content) : content, attachments: []}
			})
		})
	})
)
