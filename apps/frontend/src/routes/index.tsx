import {Effect, pipe, Stream} from 'effect'

import {type AiParts as AiPartsType, ReasoningDeltaSchema, TextDeltaSchema} from '@ai-toolkit/ai/schemas'
import {AiStream} from '@ai-toolkit/components/ai/ai-stream'
import {useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'

import {ApiClient, AtomRuntime} from '#lib/runtime.ts'

export const Route = createFileRoute('/')({component: RouteComponent})

const LLMStream = AtomRuntime.atom(
	pipe(
		Effect.gen(function* () {
			const client = yield* ApiClient
			return pipe(
				client('ai.stream', void 0),
				Stream.scan([] as AiPartsType[], (acc, next) => {
					if (acc.length === 0) return [next]

					const last = acc[acc.length - 1]

					if (last?._tag === 'TextDeltaSchema' && next._tag === 'TextDeltaSchema') {
						return [...acc.slice(0, -1), TextDeltaSchema.make({text: last.text + next.text})]
					}

					if (last?._tag === 'ReasoningDeltaSchema' && next._tag === 'ReasoningDeltaSchema') {
						return [...acc.slice(0, -1), ReasoningDeltaSchema.make({text: last.text + next.text})]
					}

					return [...acc, next]
				})
			)
		}),
		Stream.unwrap
	)
)

function RouteComponent() {
	const {value} = useAtomSuspense(LLMStream)
	return (
		<div className="p-6">
			<AiStream parts={value} />
		</div>
	)
}
