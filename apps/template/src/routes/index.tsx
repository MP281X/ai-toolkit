import {Cause} from 'effect'

import {AiStream} from '@ai-toolkit/components/ai/ai-stream'
import {Button} from '@ai-toolkit/components/ui/button'
import {Result, useAtom} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'

import {llmStreamAtom} from '#lib/atoms.ts'

export const Route = createFileRoute('/')({component: RouteComponent})

function RouteComponent() {
	const [tokens, callLLM] = useAtom(llmStreamAtom)

	return (
		<div>
			<Button onClick={() => callLLM()}>Call LLM</Button>
			{Result.match(tokens, {
				onInitial: ({waiting}) => waiting && 'loading...',
				onFailure: ({cause}) => Cause.pretty(cause),
				onSuccess: ({value}) => <AiStream parts={value} />
			})}
		</div>
	)
}
