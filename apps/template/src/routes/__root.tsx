import {Function} from 'effect'

import {createRootRoute, HeadContent, redirect, Scripts} from '@tanstack/react-router'

import './styles.css'

export const Route = createRootRoute({
	head: Function.constant({
		scripts: [import.meta.env.DEV ? {src: 'https://unpkg.com/react-scan/dist/auto.global.js'} : undefined]
	}),
	shellComponent: props => (
		<div className="flex h-dvh w-dvw flex-col">
			<HeadContent />
			<Scripts />

			{props.children}
		</div>
	),
	beforeLoad: ({location}) => {
		if (location.pathname === '/') throw redirect({to: '/chat'})
	}
})
