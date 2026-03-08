import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/input/')({
	component: RouteComponent
})

function RouteComponent() {
	return <div>Hello "/(home)/input/"!</div>
}
