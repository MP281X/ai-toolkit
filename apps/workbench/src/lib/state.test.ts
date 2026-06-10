import {describe, expect, it} from 'vite-plus/test'

import {terminalSessionKey} from './state.ts'

describe('@deslop/workbench state', () => {
	it('uses the same key for equivalent terminal sessions', () => {
		expect(
			terminalSessionKey({
				args: ['run', 'dev'],
				command: 'vp',
				cwd: '/workspace',
				env: {A: '1', B: '2'},
				sessionId: 'dev'
			})
		).toEqual(
			terminalSessionKey({
				args: ['run', 'dev'],
				command: 'vp',
				cwd: '/workspace',
				env: {A: '1', B: '2'},
				sessionId: 'dev'
			})
		)
	})
})
