import {createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'

void RpcClient

export const Route = createFileRoute('/(home)/')({component: Home})

function Home() {
	return (
		<main className="flex flex-1 items-center justify-center p-6">
			<h1 className="text-2xl font-semibold">Beer Counter</h1>
		</main>
	)
}
