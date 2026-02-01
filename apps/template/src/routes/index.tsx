import {convexQuery} from '@convex-dev/react-query'
import {useSuspenseQuery} from '@tanstack/react-query'
import {createFileRoute} from '@tanstack/react-router'

import {api} from '#convex/api.js'

export const Route = createFileRoute('/')({component: RouteComponent})

function RouteComponent() {
	const {data: tasks} = useSuspenseQuery(convexQuery(api.tasks.get))
	return (
		<div className="flex flex-col items-center justify-center gap-3">
			{tasks.map(task => (
				<div className="w-full" key={task._id}>
					{task.text}
				</div>
			))}
		</div>
	)
}
