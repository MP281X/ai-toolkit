import {Array, pipe} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string, filePath = 'sample.ts') {
	return pipe(
		StrictLinter.analyzeText(filePath, sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
}

describe('control-flow rules', () => {
	test('no-type-assertion', () => {
		expect(rulesFor('const value = input as string')).toContain('no-type-assertion')
	})

	test('no-return-undefined-null', () => {
		expect(rulesFor('function stop() { return null }')).toContain('no-return-undefined-null')
	})

	test('no-length-check', () => {
		expect(rulesFor('if (items.length > 0) { run() }')).toContain('no-length-check')
	})

	test('no-typeof', () => {
		expect(rulesFor("if (typeof value === 'string') { run() }")).toContain('no-typeof')
	})

	test('no-in-operator', () => {
		expect(rulesFor("if ('name' in user) { run() }")).toContain('no-in-operator')
	})

	test('no-nullish-checks', () => {
		expect(rulesFor('if (value === null) { return }')).toContain('no-nullish-checks')
	})

	test('no-null-literal', () => {
		expect(rulesFor('const value = null')).toContain('no-null-literal')
	})

	test('no-undefined-checks', () => {
		expect(rulesFor('if (parameter !== undefined) { run(parameter) }')).toContain('no-undefined-checks')
	})

	test('no-dynamic-imports', () => {
		expect(rulesFor("const mod = import('./feature')")).toContain('no-dynamic-imports')
	})

	test('no-else', () => {
		expect(rulesFor('if (value) { run() } else { stop() }')).toContain('no-else')
	})

	test('no-ternary-in-jsx', () => {
		expect(rulesFor('const node = active ? <Panel /> : null', 'sample.tsx')).toContain('no-ternary-in-jsx')
	})

	test('no-imperative-array-transform', () => {
		expect(rulesFor('for (const item of items) { result.push(item) }')).toContain('no-imperative-array-transform')
	})

	test('allows null in JSON stringify replacer and React ref initialization', () => {
		expect(rulesFor('JSON.stringify(value, null, 2); const ref = useRef<HTMLDivElement | null>(null)')).not.toContain(
			'no-null-literal'
		)
	})

	test('does not report length arithmetic as a length check', () => {
		expect(rulesFor('const last = items.length - 1')).not.toContain('no-length-check')
	})

	test('no-top-level-mutable-singleton', () => {
		expect(rulesFor('let container = createContainer()')).toContain('no-top-level-mutable-singleton')
	})
})
