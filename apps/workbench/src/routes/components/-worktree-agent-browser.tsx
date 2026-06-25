import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Predicate, Schema, pipe} from 'effect'

import {useEffect} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, portlessOriginsAtom} from '#lib/state.ts'
import {AgentBrowser} from '@deslop/components/agent-browser'
import type {PortlessOrigin} from '@deslop/portless/schema'

const visualizerViewport = {height: 1080, width: 1920} as const

export const AgentBrowserRouteSearch = Schema.Struct({origin: Schema.optional(Schema.String)})

function selectedOrigin(origins: readonly PortlessOrigin[], selected: string | undefined) {
	return pipe(
		Option.fromUndefinedOr(selected),
		Option.flatMap(origin => Array.findFirst(origins, candidate => candidate.origin === origin)),
		Option.getOrUndefined
	)
}

export function WorktreeAgentBrowser(input: {readonly origin?: string; readonly worktree: string}) {
	const activeHome = useAtomSuspense(activeHomeAtom(input.worktree))
	const origins = useAtomSuspense(portlessOriginsAtom(activeHome.value.activeWorktree?.root ?? ''))
	const openTab = useAtomSet(RpcClient.mutation('agentBrowser.openTab'), {mode: 'promise'})
	const switchTab = useAtomSet(RpcClient.mutation('agentBrowser.switchTab'), {mode: 'promise'})
	const setViewport = useAtomSet(RpcClient.mutation('agentBrowser.viewport'), {mode: 'promise'})
	const origin = selectedOrigin(origins.value, input.origin)
	const session = origin?.worktree ?? origins.value[0]?.worktree

	useEffect(() => {
		if (Predicate.isUndefined(origin) || Predicate.isUndefined(session)) return

		const currentOrigin = origin
		const currentSession = session
		async function open() {
			try {
				await openTab({payload: {label: currentOrigin.taskId, session: currentSession, url: currentOrigin.origin}})
				await setViewport({
					payload: {height: visualizerViewport.height, session: currentSession, width: visualizerViewport.width}
				})
			} catch {}
		}
		void open()
	}, [openTab, origin, session, setViewport])

	return (
		<AgentBrowser
			className="h-full min-h-0 w-full min-w-0"
			session={session}
			onSelectTab={tab => {
				if (Predicate.isUndefined(session)) return
				void switchTab({payload: {session, tab: tab.label ?? tab.tabId}})
			}}
		/>
	)
}
