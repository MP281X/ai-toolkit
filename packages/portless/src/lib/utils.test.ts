import {execFileSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Effect, Ref} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {command, discover} from './utils.ts'

function git(cwd: string, args: readonly string[]) {
	return execFileSync('git', [...args], {cwd, encoding: 'utf8'})
}

function withTempRoot<T>(test: (root: string) => Promise<T> | T) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const root = yield* Effect.acquireRelease(
					Effect.promise(() => mkdtemp(join(tmpdir(), 'deslop-portless-'))),
					directory => Effect.promise(() => rm(directory, {force: true, recursive: true}))
				)

				return yield* Effect.promise(() => Promise.resolve(test(root)))
			})
		)
	)
}

function initRepo(root: string) {
	mkdirSync(join(root, 'apps', 'client'), {recursive: true})
	git(root, ['init', '--initial-branch=main'])
	writeFileSync(
		join(root, 'apps', 'client', 'package.json'),
		JSON.stringify({scripts: {dev: 'vp dev', 'dev:api': 'node server.js'}}, undefined, 2)
	)
	git(root, ['add', 'apps/client/package.json'])
	git(root, ['config', 'user.email', 'test@example.com'])
	git(root, ['config', 'user.name', 'Test User'])
	git(root, ['commit', '-m', 'initial'])
}

describe('@deslop/portless discovery', () => {
	it('discovers stable script ids and canonical URL env', async () => {
		await withTempRoot(async root => {
			initRepo(root)
			const nextPort = await Effect.runPromise(Ref.make(4100))
			function run() {
				return Effect.runPromise(
					discover(root, {
						origin: host => `http://${host}:5010`,
						port: () => Ref.getAndUpdate(nextPort, value => value + 1)
					}).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
				)
			}

			const first = await run()
			const second = await run()

			expect(first.map(route => route.script.sessionId)).toEqual([
				'apps/client/package.json:dev',
				'apps/client/package.json:dev:api'
			])
			expect(second.map(route => route.script.sessionId)).toEqual(first.map(route => route.script.sessionId))
			expect(first[0]?.script.env['PORTLESS_URL']).toBe(first[0]?.script.origin)
			expect(first[0]?.script.env['VITE_PORTLESS_URL']).toBe(first[0]?.script.origin)
			expect(first[0]?.script.cwd).toBe(root)
			expect(first[0]?.script.commandCwd).toBe(join(root, 'apps', 'client'))
			expect(command(first[0]?.script ?? {command: 'vp dev', name: 'dev'}, 4100).options.cwd).toBe(
				join(root, 'apps', 'client')
			)
			expect(first[0]?.host).toMatch(/^dev\.client\.deslop-portless-[a-z0-9-]+-[a-f0-9]{8}\.localhost$/u)
		})
	})

	it('keeps preview hostnames distinct for same-named worktrees in different repositories', async () => {
		await withTempRoot(async root => {
			const firstRoot = join(root, 'first', 'feature')
			const secondRoot = join(root, 'second', 'feature')
			mkdirSync(firstRoot, {recursive: true})
			mkdirSync(secondRoot, {recursive: true})
			initRepo(firstRoot)
			initRepo(secondRoot)
			const nextPort = await Effect.runPromise(Ref.make(4100))

			function run(cwd: string) {
				return Effect.runPromise(
					discover(cwd, {
						origin: host => `http://${host}:5010`,
						port: () => Ref.getAndUpdate(nextPort, value => value + 1)
					}).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
				)
			}

			const first = await run(firstRoot)
			const second = await run(secondRoot)

			expect(first[0]?.host).not.toBe(second[0]?.host)
			expect(first[0]?.host).toMatch(/^dev\.client\.feature-[a-f0-9]{8}\.localhost$/u)
			expect(second[0]?.host).toMatch(/^dev\.client\.feature-[a-f0-9]{8}\.localhost$/u)
		})
	})

	it('prepares known dev servers with explicit host and strict port flags', () => {
		const prepared = command({command: 'vp dev', name: 'dev'}, 4123)

		expect(prepared.command).toBe('vp')
		expect(prepared.args).toEqual(['run', 'dev', '--port', '4123', '--strictPort', '--host', '127.0.0.1'])
	})

	it('prepares Vite-family dev servers with strict ports', () => {
		expect(command({command: 'vite dev', name: 'dev'}, 4123).args).toEqual([
			'run',
			'dev',
			'--port',
			'4123',
			'--strictPort',
			'--host',
			'127.0.0.1'
		])
		expect(command({command: 'pnpm exec react-router dev', name: 'dev'}, 4124).args).toEqual([
			'run',
			'dev',
			'--port',
			'4124',
			'--strictPort',
			'--host',
			'127.0.0.1'
		])
	})

	it('prepares known non-strict dev servers without strict port flags', () => {
		expect(command({command: 'astro dev', name: 'dev'}, 4123).args).toEqual([
			'run',
			'dev',
			'--port',
			'4123',
			'--host',
			'127.0.0.1'
		])
		expect(command({command: 'expo start', name: 'dev'}, 4124).args).toEqual([
			'run',
			'dev',
			'--port',
			'4124',
			'--host',
			'localhost'
		])
	})

	it('does not inject flags for frameworks that read PORT or scripts that already set flags', () => {
		expect(command({command: 'next dev', name: 'dev'}, 4123).args).toEqual(['run', 'dev'])
		expect(command({command: 'vite dev --port 3000 --host 0.0.0.0', name: 'dev'}, 4123).args).toEqual(['run', 'dev'])
		expect(command({command: 'vite dev --port=3000 --host=0.0.0.0', name: 'dev'}, 4123).args).toEqual(['run', 'dev'])
	})
})
