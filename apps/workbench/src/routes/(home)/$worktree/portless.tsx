import {Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {Browser} from '@deslop/components/render/browser'

export const Route = createFileRoute('/(home)/$worktree/portless')({
	component: PortlessPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({origin: Schema.String}))
})

function PortlessPage() {
	const search = Route.useSearch()

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Browser className="h-full min-h-0 w-full min-w-0" origin={search.origin} />
		</div>
	)
}
