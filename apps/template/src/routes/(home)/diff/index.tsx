import {useAtomSuspense} from '@effect/atom-react'

import {PatchDiff} from '@ai-toolkit/components/render/diff'
import {createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/diff/')({
	component: RouteComponent
})

function GitDiffView(props: {label: string; diffs: readonly {filePath: string; patch: string}[]}) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="border-b px-2 py-1 text-muted-foreground">{props.label}</div>
			{props.diffs.map(diff => (
				<div key={`${props.label}-${diff.filePath}`}>
					<PatchDiff patch={diff.patch} />
				</div>
			))}
		</div>
	)
}

function RouteComponent() {
	const {value: stagedDiffs} = useAtomSuspense(RpcClient.query('git.stagedDiffs', void 0))
	const {value: unstagedDiffs} = useAtomSuspense(RpcClient.query('git.unstagedDiffs', void 0))

	return (
		<div className="flex w-screen">
			<GitDiffView label="Staged changes" diffs={stagedDiffs} />
			<GitDiffView label="Unstaged changes" diffs={unstagedDiffs} />
		</div>
	)
}
