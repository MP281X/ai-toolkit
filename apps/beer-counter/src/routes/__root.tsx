import './styles.css'

import {HeadContent, Scripts, createRootRoute} from '@tanstack/react-router'

import {Toaster} from '@deslop/components/ui/sonner'

export const Route = createRootRoute({
	shellComponent: props => (
		<div className="flex h-dvh w-dvw flex-col">
			<HeadContent />
			<Scripts />
			{props.children}
			<Toaster />
		</div>
	)
})
