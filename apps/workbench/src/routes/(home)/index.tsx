import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/')({
	component: () => (
		<div className="text-muted-foreground flex h-full items-center justify-center">
			Select a worktree from the sidebar.
		</div>
	)
})
