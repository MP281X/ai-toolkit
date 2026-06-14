import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Array, Effect, Option} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {discoverPackageScripts} from './scripts.ts'

async function withTempRepo<T>(test: (root: string) => Promise<T> | T) {
	const root = await mkdtemp(path.join(tmpdir(), 'deslop-workbench-scripts-'))
	try {
		mkdirSync(path.join(root, 'apps', 'client'), {recursive: true})
		writeFileSync(
			path.join(root, 'package.json'),
			JSON.stringify({name: '@deslop/root', scripts: {check: 'vp check'}}, undefined, 2)
		)
		writeFileSync(
			path.join(root, 'apps', 'client', 'package.json'),
			JSON.stringify(
				{name: '@deslop/client', scripts: {build: 'vite build', dev: 'vp dev', preview: 'vite preview'}},
				undefined,
				2
			)
		)

		return await test(root)
	} finally {
		await rm(root, {force: true, recursive: true})
	}
}

describe('@deslop/workbench script discovery', () => {
	it('derives task ids only for root package.json scripts', async () => {
		await withTempRepo(async root => {
			const scripts = await Effect.runPromise(discoverPackageScripts(root).pipe(Effect.provide(NodeServices.layer)))

			expect(Array.map(scripts, script => script.taskId)).toEqual(['check'])
			const first = Option.getOrThrowWith(Array.head(scripts), () => new Error('expected discovered package script'))
			expect(first).toMatchObject({command: 'vp check', scriptName: 'check', sessionId: 'check', taskId: 'check'})
		})
	})
})
