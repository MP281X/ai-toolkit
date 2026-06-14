import {execFileSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Effect} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {discoverPackageScripts, packageScriptCommand, scriptRuns} from './scripts.ts'

function git(cwd: string, args: readonly string[]) {
	return execFileSync('git', [...args], {cwd, encoding: 'utf8'})
}

async function withTempRepo<T>(test: (root: string) => Promise<T> | T) {
	const root = await mkdtemp(join(tmpdir(), 'deslop-workbench-scripts-'))
	try {
		mkdirSync(join(root, 'apps', 'client'), {recursive: true})
		git(root, ['init', '--initial-branch=main'])
		git(root, ['config', 'user.email', 'test@example.com'])
		git(root, ['config', 'user.name', 'Test User'])
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({name: '@deslop/root', scripts: {check: 'vp check'}}, undefined, 2)
		)
		writeFileSync(
			join(root, 'apps', 'client', 'package.json'),
			JSON.stringify(
				{name: '@deslop/client', scripts: {build: 'vite build', dev: 'vp dev', preview: 'vite preview'}},
				undefined,
				2
			)
		)
		git(root, ['add', 'package.json', 'apps/client/package.json'])
		git(root, ['commit', '-m', 'initial'])

		return await test(root)
	} finally {
		await rm(root, {force: true, recursive: true})
	}
}

describe('@deslop/workbench script discovery', () => {
	it('derives task ids only for root package.json scripts', async () => {
		await withTempRepo(async root => {
			const scripts = await Effect.runPromise(discoverPackageScripts(root).pipe(Effect.provide(NodeServices.layer)))

			expect(scripts.map(script => script.taskId)).toEqual(['check'])
			const first = scripts[0]
			if (first === undefined) throw new Error('expected discovered package script')
			expect(packageScriptCommand(root, first).args).toEqual(['run', 'check'])
			expect(packageScriptCommand(root, first).options.cwd).toBe(root)
		})
	})

	it('builds raw script rows without portless metadata', () => {
		const rows = scriptRuns([{command: 'vp check', scriptName: 'check', sessionId: 'check', taskId: 'check'}])

		expect(rows).toEqual([{command: 'vp check', scriptName: 'check', sessionId: 'check', taskId: 'check'}])
	})
})
