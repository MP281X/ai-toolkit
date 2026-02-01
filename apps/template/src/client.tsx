import {Zero} from '@rocicorp/zero'
import {ZeroProvider} from '@rocicorp/zero/react'
import {StartClient} from '@tanstack/react-start/client'
import {StrictMode} from 'react'
import {hydrateRoot} from 'react-dom/client'

import {schema} from '#zero/schema.ts'

const z = new Zero({
	schema,
	userID: 'anon',
	server: import.meta.env['VITE_PUBLIC_SERVER']
})

hydrateRoot(
	document,
	<StrictMode>
		<ZeroProvider zero={z}>
			<StartClient />
		</ZeroProvider>
	</StrictMode>
)
