import {useAtomSet, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {Array, Cause, HashMap, Option, Predicate, Schema, pipe} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'
import {useEffect} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeSidebarAtom} from '#lib/state.ts'
import {agentBrowserOwnedTabLabels} from '@deslop/agent-browser/schema'
import {AgentBrowser} from '@deslop/components/agent-browser'
import {toast} from '@deslop/components/ui/sonner'
import {formatError} from '@deslop/components/utils'
import {terminalStatusActive} from '@deslop/terminal/schema'

type AgentBrowserRouteSearch = typeof AgentBrowserRouteSearch.Type
export const AgentBrowserRouteSearch = Schema.Struct({origin: Schema.optional(Schema.String)})

export function WorktreeAgentBrowser(input: AgentBrowserRouteSearch & {worktree: string}) {
	const activeSidebar = useAtomSuspense(activeSidebarAtom(input.worktree))
	const sync = useAtomSet(RpcClient.mutation('agentBrowser.sync'))
	const switchTab = useAtomSet(RpcClient.mutation('agentBrowser.switchTab'))
	const origins = pipe(
		activeSidebar.value.activeWorktree?.portlessRuns ?? [],
		Array.filter(run => {
			const status = activeSidebar.value.activeWorktree?.runStatuses[run.script.sessionId] ?? {state: 'idle', title: ''}
			return terminalStatusActive(status.state) && status.state !== 'idle'
		}),
		Array.map(run => run.origin),
		Array.dedupeWith((left, right) => left.origin === right.origin)
	)
	const session = pipe(
		origins,
		Array.head,
		Option.map(origin => origin.worktree),
		Option.getOrUndefined
	)
	const labels = agentBrowserOwnedTabLabels(Array.map(origins, candidate => candidate.origin))
	const originKey = pipe(
		Array.map(origins, candidate => candidate.origin),
		Array.join('\n')
	)
	const tabs = Array.map(origins, candidate => ({
		id: candidate.origin,
		label: candidate.taskId,
		streamLabel: pipe(
			labels,
			HashMap.get(candidate.origin),
			Option.getOrElse(() => candidate.origin)
		),
		url: candidate.origin
	}))

	useEffect(() => {
		if (origins.length === 0 || Predicate.isUndefined(activeSidebar.value.activeWorktree?.root)) return
		sync({payload: {cwd: activeSidebar.value.activeWorktree.root}})
	}, [activeSidebar.value.activeWorktree?.root, input.worktree, originKey, origins.length, sync])
	useAtomSubscribe(RpcClient.mutation('agentBrowser.sync'), result => {
		if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) toast.error(formatError(result.cause))
	})
	useAtomSubscribe(RpcClient.mutation('agentBrowser.switchTab'), result => {
		if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) toast.error(formatError(result.cause))
	})

	return (
		<AgentBrowser
			className="h-full min-h-0 w-full min-w-0"
			session={session}
			tabs={tabs}
			onSelectTab={tab => {
				if (Predicate.isUndefined(session)) return
				switchTab({payload: {origin: tab.id, session}})
			}}
		/>
	)
}
