import {OAuth} from '@ai-toolkit/oauth/server'
import {createFileRoute} from '@tanstack/react-router'

import {ServerRuntime} from '#lib/serverRuntime.ts'

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			ANY: ({request}) => ServerRuntime.runPromise(OAuth.handler(request))
		}
	}
})
