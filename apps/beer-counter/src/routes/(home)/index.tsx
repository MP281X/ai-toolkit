import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/')({component: HomePage})

function HomePage() {
	return <main className="min-h-0 flex-1" />
}
