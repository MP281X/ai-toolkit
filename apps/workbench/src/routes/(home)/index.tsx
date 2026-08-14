import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({component: AppName})

// oxlint-disable-next-line @deslop/oxlint-rules/no-trivial-indirection -- The named component owns the React hook boundary.
function AppName() {
	return useAtomSuspense(RpcClient.query('app.name', undefined)).value
}
