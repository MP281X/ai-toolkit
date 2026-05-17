import {useAtomSuspense} from '@effect/atom-react'

import {Cause, Effect, Hash, String} from 'effect'

import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import mermaid from 'mermaid'

import {cn} from '#lib/utils.ts'

const mermaidAtom = Atom.family((source: string) =>
	Atom.make(
		Effect.tryPromise(async () => {
			mermaid.initialize({securityLevel: 'loose', startOnLoad: false})
			const result = await mermaid.render(`mermaid_${Hash.string(source)}`, source)
			return result
		})
	)
)

export function Mermaid(props: {readonly children: string; readonly className?: string}) {
	const result = useAtomSuspense(mermaidAtom(props.children), {includeFailure: true})

	if (AsyncResult.isFailure(result)) {
		return (
			<pre
				className={cn(
					'border-border bg-muted/30 text-destructive border px-3 py-2 text-sm whitespace-pre-wrap',
					props.className
				)}
			>
				{String.trim(Cause.pretty(result.cause))}
			</pre>
		)
	}

	return (
		<div
			dangerouslySetInnerHTML={{__html: result.value.svg}}
			className={cn(
				'bg-muted/30 overflow-hidden p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full',
				props.className
			)}
		/>
	)
}
