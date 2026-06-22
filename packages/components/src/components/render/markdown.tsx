import {Array, Match, Predicate, pipe} from 'effect'

import {Marked} from 'marked'

import {Code} from './code.tsx'
import {Mermaid} from './mermaid.tsx'

import {cn} from '#lib/utils.ts'

const marked = new Marked({async: false, breaks: true, gfm: true})

export function Markdown(props: {readonly children: string; readonly className?: string}) {
	return (
		<div className={cn('markdown text-wrap wrap-break-word select-text', props.className)}>
			{Array.map(marked.lexer(props.children), (token, index) =>
				pipe(
					Match.value(token),
					Match.when({type: 'html'}, () => null),
					Match.when({lang: 'mermaid', type: 'code'}, code => (
						<Mermaid key={index} className="border-border border">
							{code.text}
						</Mermaid>
					)),
					Match.when({type: 'code'}, code => (
						<Code
							key={index}
							className="border-border border"
							lang={Predicate.isString(code.lang) ? code.lang : undefined}
						>
							{code.text}
						</Code>
					)),
					Match.orElse(other => <div key={index} dangerouslySetInnerHTML={{__html: marked.parse(other.raw)}} />)
				)
			)}
		</div>
	)
}
