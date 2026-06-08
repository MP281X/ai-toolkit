import {useAtomSuspense} from '@effect/atom-react'

import {Schema} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {activeHomeAtom} from '#lib/state.ts'
import {WorkbenchTerminal} from '#routes/components/-workbench-terminal.tsx'
import {Fallback} from '@deslop/components/fallbacks'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			command: Schema.optional(Schema.String),
			cwd: Schema.optional(Schema.String),
			env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
			inactive: Schema.optional(Schema.Boolean),
			sessionId: Schema.String
		})
	)
})

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	if (search.inactive === true) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0 p-2">
				<Fallback message="This script has not been started yet. Use the play button to start it." />
			</div>
		)
	}

	return (
		<RunTerminal
			command={search.command}
			cwd={search.cwd ?? activeHome.value.activeWorktree.root}
			env={search.env}
			sessionId={search.sessionId}
		/>
	)
}

function RunTerminal(input: {
	readonly command?: string
	readonly cwd: string
	readonly env?: Readonly<Record<string, string>>
	readonly sessionId: string
}) {
	const session =
		input.command === undefined
			? {cwd: input.cwd, sessionId: input.sessionId}
			: {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, env: input.env, sessionId: input.sessionId}

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				session={session}
			/>
		</div>
	)
}
