import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Predicate, Schema, pipe} from 'effect'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeSidebarAtom, portlessOriginsAtom} from '#lib/state.ts'
import {AgentBrowser} from '@deslop/components/agent-browser'
import type {PortlessOrigin} from '@deslop/portless/schema'

export const AgentBrowserRouteSearch = Schema.Struct({origin: Schema.optional(Schema.String)})

function selectedOrigin(origins: readonly PortlessOrigin[], selected: string | undefined) {
	return pipe(
		Option.fromUndefinedOr(selected),
		Option.flatMap(origin => Array.findFirst(origins, candidate => candidate.origin === origin)),
		Option.orElse(() => Array.head(origins)),
		Option.getOrUndefined
	)
}

function sameOrigin(left: string | undefined, right: string) {
	if (Predicate.isUndefined(left)) return false
	try {
		return new URL(left).origin === new URL(right).origin
	} catch {
		return false
	}
}

function tabLabel(origins: readonly PortlessOrigin[], url: string | undefined) {
	return pipe(
		origins,
		Array.findFirst(origin => sameOrigin(url, origin.origin)),
		Option.map(origin => origin.taskId),
		Option.getOrUndefined
	)
}

export function WorktreeAgentBrowser(input: {readonly origin?: string; readonly worktree: string}) {
	const activeSidebar = useAtomSuspense(activeSidebarAtom(input.worktree))
	const origins = useAtomSuspense(portlessOriginsAtom(activeSidebar.value.activeWorktree?.root ?? ''))
	const switchTab = useAtomSet(RpcClient.mutation('agentBrowser.switchTab'), {mode: 'promise'})
	const origin = selectedOrigin(origins.value, input.origin)
	const session = origin?.worktree ?? origins.value[0]?.worktree

	return (
		<AgentBrowser
			className="h-full min-h-0 w-full min-w-0"
			labelForTab={tab => tabLabel(origins.value, tab.url)}
			selectedUrl={origin?.origin}
			session={session}
			onSelectTab={tab => {
				if (Predicate.isUndefined(session)) return
				void switchTab({payload: {session, tab: tab.tabId}})
			}}
		/>
	)
}
