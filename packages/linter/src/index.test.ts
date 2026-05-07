import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname} from 'node:path'

import {Array, Effect, String} from 'effect'

import {describe, expect, test} from 'bun:test'
import {analyzeText, renderText, runDeslop} from './index.ts'

async function createWorkspace(files: readonly (readonly [string, string])[]) {
	const workspacePath = await mkdtemp(`${tmpdir()}/deslop-`)

	await Effect.runPromise(
		Effect.forEach(files, file =>
			Effect.promise(async () => {
				await mkdir(dirname(`${workspacePath}/${file[0]}`), {recursive: true})
				await writeFile(`${workspacePath}/${file[0]}`, file[1])
			})
		)
	)

	return workspacePath
}

describe('deslop renderers', () => {
	test('renders oxlint-style text output', () => {
		expect(
			String.replace(
				RegExp('\\u001b\\[[0-9;]*m', 'g'),
				''
			)(renderText(analyzeText('sample.ts', 'const enabled = value === true\n')))
		).toContain(
			'sample.ts 1\n\nL1:7  @enabled  no-simple-condition-variable\nCode            const enabled = value === true\nProblem            Inline simple condition where control flow uses it.'
		)
	})
})

describe('runDeslop', () => {
	test('uses git file discovery and filters hardcoded exclusions in path mode', async () => {
		const cwd = await createWorkspace([
			['src/main.ts', 'const enabled = value === true\n'],
			[
				'src/main.test.ts',
				"test('keeps main rules', () => { const result = {output: 'ok'}; expect(result).toEqual({output: 'ok'}) })\n"
			],
			['node_modules/pkg/index.ts', 'const hidden = value === true\n'],
			['.opencode/resources/external.ts', 'const external = value === true\n'],
			['packages/app/src/components/ui/button.tsx', 'const ui = value === true\n'],
			['src/types.d.ts', 'declare const value: string\n'],
			['.gitignore', 'ignored.ts\n'],
			['ignored.ts', 'const ignored = value === true\n']
		])

		await Bun.spawn(['git', 'init'], {cwd}).exited
		await Bun.spawn(['git', 'add', 'src/main.ts', 'src/main.test.ts', '.gitignore'], {cwd}).exited

		const result = await Effect.runPromise(
			runDeslop({
				cwd,
				mode: 'paths',
				paths: ['.']
			})
		)

		expect(result.files).toEqual(['src/main.test.ts', 'src/main.ts'])
		expect(Array.map(result.diagnostics, diagnostic => diagnostic.filePath)).toEqual([
			'src/main.test.ts',
			'src/main.test.ts',
			'src/main.ts'
		])
		await rm(cwd, {force: true, recursive: true})
	})

	test('returns SDK results for scoped paths', async () => {
		const cwd = await createWorkspace([['src/main.ts', 'const enabled = value === true\n']])
		await Bun.spawn(['git', 'init'], {cwd}).exited
		await Bun.spawn(['git', 'add', 'src/main.ts'], {cwd}).exited
		const result = await Effect.runPromise(runDeslop({cwd, mode: 'paths', paths: ['src/main.ts']}))

		expect(result.diagnostics[0]?.rule).toBe('no-simple-condition-variable')
		await rm(cwd, {force: true, recursive: true})
	})

	test('normalizes scoped paths for git modes', async () => {
		const cwd = await createWorkspace([['src/main.ts', 'const enabled = value === true\n']])
		await Bun.spawn(['git', 'init'], {cwd}).exited
		await Bun.spawn(['git', 'add', 'src/main.ts'], {cwd}).exited

		expect((await Effect.runPromise(runDeslop({cwd, mode: 'staged', paths: ['./']}))).files).toEqual(['src/main.ts'])
		expect((await Effect.runPromise(runDeslop({cwd, mode: 'staged', paths: ['src/']}))).files).toEqual(['src/main.ts'])
		expect((await Effect.runPromise(runDeslop({cwd, mode: 'staged', paths: ['./src/']}))).files).toEqual([
			'src/main.ts'
		])
		await rm(cwd, {force: true, recursive: true})
	})
})
