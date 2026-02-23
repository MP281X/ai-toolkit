import {Function} from 'effect'

import {createRootRoute, HeadContent, Scripts} from '@tanstack/react-router'

import icon from './icon.png'
import stylesheet from './styles.css?url'

export const Route = createRootRoute({
	ssr: false,
	head: Function.constant({
		meta: [{title: 'template'}],
		links: [
			{rel: 'stylesheet', href: stylesheet},
			{rel: 'icon', href: icon}
		],
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
