import {describe, expect, it} from 'vite-plus/test'

import {command} from './utils.ts'

describe('@deslop/portless command preparation', () => {
	it('prepares vp dev commands with explicit host and strict port flags', () => {
		const prepared = command({command: 'vp dev', cwd: '/tmp/worktree', taskId: '@deslop/app#dev'}, 4123)

		expect(prepared.command).toBe('vp')
		expect(prepared.args).toEqual(['run', '@deslop/app#dev', '--port', '4123', '--strictPort', '--host', '127.0.0.1'])
		expect(prepared.options.cwd).toBe('/tmp/worktree')
	})

	it('prepares vite dev commands with strict ports', () => {
		expect(command({command: 'vite dev', cwd: '/tmp/worktree', taskId: '@deslop/app#dev'}, 4123).args).toEqual([
			'run',
			'@deslop/app#dev',
			'--port',
			'4123',
			'--strictPort',
			'--host',
			'127.0.0.1'
		])
		expect(
			command({command: 'vpx vite dev', cwd: '/tmp/worktree', taskId: '@deslop/app#dev:client'}, 4124).args
		).toEqual(['run', '@deslop/app#dev:client', '--port', '4124', '--strictPort', '--host', '127.0.0.1'])
	})

	it('replaces existing vite host and port flags', () => {
		expect(
			command({command: 'vite dev --port 3000 --host 0.0.0.0', cwd: '/tmp/worktree', taskId: '@deslop/app#dev'}, 4123)
				.args
		).toEqual(['run', '@deslop/app#dev', '--port', '4123', '--strictPort', '--host', '127.0.0.1'])
		expect(
			command({command: 'vite dev --port=3000 --host=0.0.0.0', cwd: '/tmp/worktree', taskId: '@deslop/app#dev'}, 4123)
				.args
		).toEqual(['run', '@deslop/app#dev', '--port', '4123', '--strictPort', '--host', '127.0.0.1'])
	})
})
