import {Function} from 'effect'

import {ConvexAuthProvider} from '@convex-dev/auth/react'
import {createRootRoute, HeadContent, Scripts, useRouter} from '@tanstack/react-router'
import {ConvexReactClient} from 'convex/react'

export const Route = createRootRoute({
	head: Function.constant({
		meta: [{title: 'template'}],
		scripts: [import.meta.env.DEV ? {src: 'https://unpkg.com/react-scan/dist/auto.global.js'} : {}]
	}),
	shellComponent: ShellComponent
})

function ShellComponent(props: {children: React.ReactNode}) {
	const router = useRouter()

	return (
		<>
			<HeadContent />
			<Scripts />

			<ConvexAuthProvider
				client={new ConvexReactClient(import.meta.env['VITE_CONVEX_URL'])}
				replaceURL={relativeUrl => router.navigate({to: relativeUrl, replace: true})}
			>
				{props.children}
			</ConvexAuthProvider>
		</>
	)
}
