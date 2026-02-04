import {Cause, Effect, pipe, Stream} from 'effect'

import {AccumulateTextStream} from '@ai-toolkit/ai'
import {AiStream} from '@ai-toolkit/components/ai/ai-stream'
import {Button} from '@ai-toolkit/components/ui/button'
import {Result, useAtom} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'

import {AtomRuntime, ConvexRpc} from '#lib/atomRuntime.ts'
export const Route = createFileRoute('/(home)/')({component: RouteComponent})

const AiStreamAtom = AtomRuntime.fn((prompt: string) =>
	pipe(
		Effect.andThen(ConvexRpc, client => client('AiStream', {prompt})),
		Stream.unwrap,
		Stream.tap(Effect.log),
		AccumulateTextStream
	)
)

function RouteComponent() {
	const [parts, callLLM] = useAtom(AiStreamAtom)

	return (
		<div className="flex h-svh w-full flex-col items-center justify-center">
			<Button
				disabled={Result.isWaiting(parts)}
				onClick={() => callLLM('return a string with 5 words related to programming')}
			>
				STREAM LLM
			</Button>
			{Result.match(parts, {
				onInitial: ({waiting}) => waiting && 'loading...',
				onFailure: ({cause}) => Cause.pretty(cause),
				onSuccess: ({value}) => <AiStream parts={value} />
			})}
		</div>
	)
}
