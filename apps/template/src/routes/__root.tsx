import {Function} from 'effect'

import {createRootRoute, HeadContent, Scripts} from '@tanstack/react-router'

export const Route = createRootRoute({
	head: Function.constant({
		meta: [{title: 'template'}],
		scripts: [import.meta.env.DEV ? {src: 'https://unpkg.com/react-scan/dist/auto.global.js'} : {}]
	}),
	shellComponent: props => (
		<div className="flex min-h-dvh flex-col">
			<HeadContent />
			<Scripts />

			{props.children}
		</div>
	)
})
