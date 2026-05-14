import './styles.css'

import {Function} from 'effect'

import {HeadContent, Scripts, createRootRoute} from '@tanstack/react-router'

export const Route = createRootRoute({
	head: Function.constant({
		scripts: [
			import.meta.env.DEV ? {src: 'https://unpkg.com/react-scan/dist/auto.global.js'} : undefined,
			import.meta.env.DEV ? {src: 'https://unpkg.com/react-grab/dist/index.global.js'} : undefined
		]
	}),
	shellComponent: props => (
		<div className="flex h-dvh w-dvw flex-col">
			<HeadContent />
			<Scripts />

			{props.children}
		</div>
	)
})
