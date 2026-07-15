import './styles.css'

import {HeadContent, Scripts, createRootRoute} from '@tanstack/react-router'

export const Route = createRootRoute({
	shellComponent: props => (
		<>
			<HeadContent />
			<Scripts />
			{props.children}
		</>
	)
})
