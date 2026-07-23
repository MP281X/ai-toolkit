import {Array, HashMap, Match, Option, Predicate, pipe} from 'effect'

import DOMPurify from 'dompurify'
import {Marked} from 'marked'

import {Code} from './code.tsx'
import {Mermaid} from './mermaid.tsx'

import {cn} from '#lib/utils.ts'

const marked = new Marked({async: false, breaks: true, gfm: true})

export function Markdown(props: {readonly children: string; readonly className?: string}) {
	const tokens = marked.lexer(props.children)
	const keyedTokens = Array.mapAccum(tokens, HashMap.empty<string, number>(), (occurrences, token) => {
		const occurrence = pipe(
			occurrences,
			HashMap.get(token.raw),
			Option.getOrElse(() => 0)
		)

		return [HashMap.set(occurrences, token.raw, occurrence + 1), {key: `${token.raw}:${occurrence}`, token}]
	})[1]

	return (
		<div className={cn('markdown text-wrap wrap-break-word select-text', props.className)}>
			{Array.map(keyedTokens, keyed =>
				pipe(
					Match.value(keyed.token),
					Match.when({type: 'html'}, () => null),
					Match.when({lang: 'mermaid', type: 'code'}, code => (
						<Mermaid key={keyed.key} className="border-border border">
							{code.text}
						</Mermaid>
					)),
					Match.when({type: 'code'}, code => (
						<Code
							key={keyed.key}
							className="border-border border"
							lang={Predicate.isString(code.lang) ? code.lang : undefined}
						>
							{code.text}
						</Code>
					)),
					Match.orElse(other => (
						<div
							key={keyed.key}
							dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(marked.parse(other.raw, {async: false}))}}
						/>
					))
				)
			)}
		</div>
	)
}
