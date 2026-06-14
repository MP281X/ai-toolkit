import './styles.css'

import {HeadContent, Scripts, createRootRoute} from '@tanstack/react-router'

import {Toaster} from '@deslop/components/ui/sonner'

export const Route = createRootRoute({
	shellComponent: props => (
		<div className="bg-background text-foreground flex h-dvh w-dvw flex-col font-mono text-xs antialiased">
			<HeadContent />
			<Scripts />

			{props.children}
			<Toaster />
		</div>
	)
})
