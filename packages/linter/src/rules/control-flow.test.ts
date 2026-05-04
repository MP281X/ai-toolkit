import {Array, pipe} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string, filePath = 'sample.ts') {
	return pipe(
		StrictLinter.analyzeText(filePath, sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
}

function typedRulesFor(sourceText: string, filePath = 'sample.ts') {
	return pipe(
		StrictLinter.analyzeTypedText(filePath, sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
}

describe('control-flow rules', () => {
	test('no-type-assertion', () => {
		expect(rulesFor('const value = input as string')).toContain('no-type-assertion')
	})

	test('allows const assertions', () => {
		expect(rulesFor("const options = {themeType: 'system'} as const")).not.toContain('no-type-assertion')
	})

	test('no-return-undefined-null', () => {
		expect(rulesFor('function stop() { return null }')).toContain('no-return-undefined-null')
	})

	test('no-length-check', () => {
		expect(rulesFor('if (items.length > 0) { run() }')).toContain('no-length-check')
	})

	test('no-redundant-type-check flags redundant typeof checks', () => {
		expect(typedRulesFor("const value = 'ok'; if (typeof value === 'string') { run() }")).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check allows narrowing typeof checks', () => {
		expect(
			typedRulesFor("const value: string | number = input; if (typeof value === 'string') { run() }")
		).not.toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check flags redundant in checks', () => {
		expect(typedRulesFor("const user: {name: string} = {name: 'Ada'}; if ('name' in user) { run() }")).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check flags redundant nullish equality checks', () => {
		expect(typedRulesFor("const value = 'ok'; if (value === undefined) { return }")).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-null-literal', () => {
		expect(rulesFor('const value = null')).toContain('no-null-literal')
	})

	test('no-redundant-type-check allows nullable equality checks', () => {
		expect(
			typedRulesFor('const value: string | undefined = input; if (value !== undefined) { run(value) }')
		).not.toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check flags optional access on non-nullish values', () => {
		expect(typedRulesFor("const user: {name: string} = {name: 'Ada'}; user?.name")).toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check allows optional access on nullable values', () => {
		expect(typedRulesFor('const user: {name: string} | undefined = input; user?.name')).not.toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check flags nullish fallbacks on non-nullish values', () => {
		expect(typedRulesFor("const userName = 'Ada'; const label = userName ?? 'Unknown'")).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check flags nullish assignment fallbacks on non-nullish values', () => {
		expect(typedRulesFor("let userName = 'Ada'; userName ??= 'Unknown'")).toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check allows nullish fallbacks on nullable values', () => {
		expect(
			typedRulesFor("const userName: string | undefined = input; const label = userName ?? 'Unknown'")
		).not.toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check flags redundant non-null assertions', () => {
		expect(typedRulesFor("const userName = 'Ada'; userName!")).toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check skips any and unknown', () => {
		expect(
			typedRulesFor('declare const a: any; declare const u: unknown; a?.name; if (u === undefined) { run() }')
		).not.toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check flags Array.isArray when type is already array', () => {
		expect(typedRulesFor('const items: string[] = []; if (Array.isArray(items)) { run() }')).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check flags instanceof when type is already known', () => {
		expect(typedRulesFor('const date = new Date(); if (date instanceof Date) { run() }')).toContain(
			'no-redundant-type-check'
		)
	})

	test('no-redundant-type-check flags provably impossible truthiness checks', () => {
		expect(typedRulesFor("const value = {name: 'Ada'}; if (!value) { run() }")).toContain('no-redundant-type-check')
	})

	test('no-redundant-type-check allows truthiness checks with possible falsy values', () => {
		expect(typedRulesFor('const value: string = input; if (!value) { run() }')).not.toContain('no-redundant-type-check')
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
