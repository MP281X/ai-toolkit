import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/')({component: IndexPage})

function IndexPage() {
	return (
		<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
			Select a worktree from the sidebar.
		</div>
	)
}
