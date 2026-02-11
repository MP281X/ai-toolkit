import {Function} from 'effect'

import {createRootRoute, HeadContent, Scripts} from '@tanstack/react-router'

import stylesheet from './styles.css?url'

export const Route = createRootRoute({
	head: Function.constant({
		meta: [{title: 'template'}],
		links: [{rel: 'stylesheet', href: stylesheet}],
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
