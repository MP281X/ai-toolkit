import {useQuery} from '@rocicorp/zero/react'
import {createFileRoute} from '@tanstack/react-router'

import {queries} from '#zero/queries.ts'

export const Route = createFileRoute('/')({
	ssr: false,
	component: RouteComponent
})

function RouteComponent() {
	const [users] = useQuery(queries.users.all())

	return (
		<div>
			{users.map(u => (
				<div key={u.id}>{u.name}</div>
			))}
		</div>
	)
}
