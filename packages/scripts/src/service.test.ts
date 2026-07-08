import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'
import {afterEach, describe, expect, it} from '@effect/vitest'

import {Array, Context, Effect, HashMap, Option, Order, pipe} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

import {Scripts} from './service.ts'

const repositories = Array.empty<string>()

function repository() {
	const cwd = mkdtempSync(join(tmpdir(), 'deslop-scripts-'))
	repositories.push(cwd)
	return cwd
}

function write(cwd: string, filePath: string, content: string) {
	mkdirSync(join(cwd, filePath, '..'), {recursive: true})
	writeFileSync(join(cwd, filePath), content)
}

function runScripts<A>(cwd: string, effect: Effect.Effect<A, unknown, Scripts>) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(effect, Effect.provide(Scripts.layer({cwd})), Effect.provide(NodeServices.layer))
	)
}

function commandSnapshot(command: ChildProcess.StandardCommand) {
	return {args: command.args, command: command.command, cwd: command.options.cwd}
}

function scriptNames(scripts: HashMap.HashMap<string, ChildProcess.StandardCommand>) {
	return Array.sort(Array.fromIterable(HashMap.keys(scripts)), Order.String)
}

afterEach(() => {
	for (const cwd of repositories.splice(0)) {
		rmSync(cwd, {force: true, recursive: true})
	}
})

describe('Scripts', () => {
	it('discovers only unprefixed root package scripts', async () => {
		const cwd = repository()
		write(
			cwd,
			'package.json',
			'{"deslop":{"dev":["@deslop/workbench#dev:server"]},"name":"@deslop","scripts":{"check":"vp check","test":"vp test"}}'
		)
		write(cwd, 'apps/workbench/package.json', '{"name":"@deslop/workbench","scripts":{"build":"vite build"}}')
		write(cwd, 'packages/scripts/package.json', '{"name":"@deslop/scripts","scripts":{"lint":"vp check"}}')

		const scripts = await runScripts(
			cwd,
			Effect.gen(function* () {
				return yield* Scripts
			})
		)

		expect(scriptNames(scripts.scripts)).toEqual(['check', 'test'])
		expect(pipe(HashMap.get(scripts.scripts, 'check'), Option.map(commandSnapshot), Option.getOrUndefined)).toEqual({
			args: ['run', 'check'],
			command: 'vp',
			cwd
		})
		expect(pipe(HashMap.get(scripts.scripts, 'workbench#build'), Option.isNone)).toBe(true)
		expect(pipe(HashMap.get(scripts.scripts, 'scripts#lint'), Option.isNone)).toBe(true)
	})

	it('keeps configured dev commands package-targeted', async () => {
		const cwd = repository()
		write(cwd, 'package.json', '{"deslop":{"dev":["@deslop/workbench#dev:server"]},"scripts":{"check":"vp check"}}')

		const scripts = await runScripts(
			cwd,
			Effect.gen(function* () {
				return yield* Scripts
			})
		)

		expect(scriptNames(scripts.dev)).toEqual(['workbench#dev:server'])
		expect(
			pipe(HashMap.get(scripts.dev, 'workbench#dev:server'), Option.map(commandSnapshot), Option.getOrUndefined)
		).toEqual({args: ['run', '@deslop/workbench#dev:server'], command: 'vp', cwd})
	})
})
