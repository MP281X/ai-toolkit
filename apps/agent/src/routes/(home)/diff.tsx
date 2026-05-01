import {createFileRoute} from '@tanstack/react-router'
import {startTransition} from 'react'

import {ReviewViewPanel, useHomeSelection} from './route.tsx'

export const Route = createFileRoute('/(home)/diff')({
	component: DiffRoute
})

function DiffRoute() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const {activeWorktree} = useHomeSelection(search)

	if (!activeWorktree) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">No project selected.</div>
		)
	}

	return (
		<ReviewViewPanel
			key={activeWorktree['root']}
			activeReviewScope={search.reviewScope === 'head-to-staged' ? 'head-to-staged' : 'staged-to-worktree'}
			activeWorktree={activeWorktree}
			reviewFile={search.reviewFile}
			selectReviewEntry={(scope, filePath) =>
				startTransition(() => {
					navigate({search: current => ({...current, reviewFile: filePath, reviewScope: scope})})
				})
			}
		/>
	)
}
