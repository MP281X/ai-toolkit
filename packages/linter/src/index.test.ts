import {mkdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'

import {Effect} from 'effect'

import {afterEach, describe, expect, test} from 'bun:test'
import {StrictLinter} from './index.ts'

const tempDirectories: string[] = []

afterEach(async () => {
	await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, {force: true, recursive: true})))
})

const createWorkspace = async (files: [string, string][]) => {
	const cwd = `${tmpdir()}/strict-lint-${crypto.randomUUID()}`
	tempDirectories.push(cwd)

	for (const [filePath, sourceText] of files) {
		await mkdir(`${cwd}/${filePath}`.slice(0, `${cwd}/${filePath}`.lastIndexOf('/')), {recursive: true})
		await writeFile(`${cwd}/${filePath}`, sourceText)
	}

	return cwd
}

describe('StrictLinter renderers', () => {
	test('renders oxlint-style text output', () => {
		process.env['NO_COLOR'] = '1'

		expect(
			StrictLinter.renderText(StrictLinter.analyzeText('sample.ts', 'const enabled = value === true\n'))
		).toContain(
			'sample.ts 1\n- L1 @enabled "const enabled = value === true" no-simple-condition-variable -> inline condition'
		)

		delete process.env['NO_COLOR']
	})
})

describe('StrictLinter.runEffect', () => {
	test('uses git file discovery and filters hardcoded exclusions in path mode', async () => {
		const cwd = await createWorkspace([
			['src/main.ts', 'const enabled = value === true\n'],
			['node_modules/pkg/index.ts', 'const hidden = value === true\n'],
			['.opencode/resources/external.ts', 'const external = value === true\n'],
			['packages/app/src/components/ui/button.tsx', 'const ui = value === true\n'],
			['src/types.d.ts', 'declare const value: string\n'],
			['.gitignore', 'ignored.ts\n'],
			['ignored.ts', 'const ignored = value === true\n']
		])

		await Bun.spawn(['git', 'init'], {cwd}).exited
		await Bun.spawn(['git', 'add', 'src/main.ts', '.gitignore'], {cwd}).exited

		const result = await Effect.runPromise(
			StrictLinter.runEffect({
				cwd,
				mode: 'paths',
				paths: ['.']
			})
		)

		expect(result.files).toEqual(['src/main.ts'])
		expect(result.diagnostics.map(diagnostic => diagnostic.filePath)).toEqual(['src/main.ts'])
	})

	test('returns SDK results for scoped paths', async () => {
		const cwd = await createWorkspace([['src/main.ts', 'const enabled = value === true\n']])
		await Bun.spawn(['git', 'init'], {cwd}).exited
		await Bun.spawn(['git', 'add', 'src/main.ts'], {cwd}).exited
		const result = await StrictLinter.run({cwd, mode: 'paths', paths: ['src/main.ts']})

		expect(result.diagnostics[0]?.rule).toBe('no-simple-condition-variable')
	})
})
