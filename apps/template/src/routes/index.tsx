// import {pipe, Stream} from 'effect'

// import {AiSdk} from '@ai-toolkit/ai'
import {createFileRoute} from '@tanstack/react-router'
// import {createServerFn} from '@tanstack/react-start'

// import {ServerRuntime} from '#lib/serverRuntime.ts'

// const getData = createServerFn().handler(async function* () {
// 	yield* pipe(
// 		//
// 		Stream.unwrap(AiSdk.stream()),
// 		Stream.toAsyncIterableRuntime(await ServerRuntime.runtime())
// 	)
// })

export const Route = createFileRoute('/')({component: RouteComponent})

function RouteComponent() {
	return <div className="p-6">"ok"</div>
}
