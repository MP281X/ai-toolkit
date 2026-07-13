import {useAtomSuspense} from '@effect/atom-react'

import {Effect} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {Suspense} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {Loading} from '@deslop/components/fallbacks'

const appNameAtom = RpcClient.runtime.atom(Effect.flatMap(RpcClient, client => client('app.name', {})))

export const Route = createFileRoute('/(home)/')({component: HomeRoute})

function AppName() {
	const appName = useAtomSuspense(appNameAtom)

	return <h1 className="font-mono text-3xl font-bold">{appName.value}</h1>
}

function HomeRoute() {
	return (
		<main className="flex min-h-0 flex-1 items-center justify-center p-6">
			<Suspense fallback={<Loading />}>
				<AppName />
			</Suspense>
		</main>
	)
}
