import {useAtomSuspense} from '@effect/atom-react'
import {Cause, Effect, Hash, String} from 'effect'

import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import mermaid from 'mermaid'

import {cn} from '#lib/utils.ts'

const mermaidAtom = Atom.family((source: string) => {
	return Atom.make(
		Effect.tryPromise(() => {
			mermaid.initialize({startOnLoad: false, securityLevel: 'loose'})
			return mermaid.render(`mermaid_${Hash.string(source)}`, source)
		})
	)
})

export function Mermaid(props: {readonly children: string; readonly className?: string}) {
	const result = useAtomSuspense(mermaidAtom(props.children), {includeFailure: true})

	if (AsyncResult.isFailure(result)) {
		return (
			<pre
				className={cn(
					'whitespace-pre-wrap border border-border bg-muted/30 px-3 py-2 text-destructive text-sm',
					props.className
				)}
			>
				{String.trim(Cause.pretty(result.cause))}
			</pre>
		)
	}

	return (
		<div
			// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid html
			dangerouslySetInnerHTML={{__html: result.value.svg}}
			className={cn(
				'overflow-hidden bg-muted/30 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full',
				props.className
			)}
		/>
	)
}
