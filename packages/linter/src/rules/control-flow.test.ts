import {Array} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string, filePath?: string) {
	return Array.map(StrictLinter.analyzeText(filePath ?? 'sample.ts', sourceText), diagnostic => diagnostic.rule)
}

function typedRulesFor(sourceText: string, filePath?: string) {
	return Array.map(StrictLinter.analyzeTypedText(filePath ?? 'sample.ts', sourceText), diagnostic => diagnostic.rule)
}

describe('control-flow rules', () => {
	test('no-type-assertion', () => {
		expect(rulesFor('const value = input as string')).toContain('no-type-assertion')
	})

	test('no-any', () => {
		expect(rulesFor('function parse(value: any) { return value }')).toContain('no-any')
	})

	test('no-throw', () => {
		expect(rulesFor("function fail() { throw new Error('boom') }")).toContain('no-throw')
	})

	test('no-error-constructor', () => {
		expect(rulesFor("const error = new Error('boom')")).toContain('no-error-constructor')
	})

	test('no-try-catch', () => {
		expect(rulesFor('try { run() } catch (error) { fail(error) }')).toContain('no-try-catch')
	})

	test('no-default-export', () => {
		expect(rulesFor('export default function run() { return value }')).toContain('no-default-export')
	})

	test('no-async-await outside tests', () => {
		expect(rulesFor('async function run() { return await work() }')).toContain('no-async-await')
	})

	test('allows async-await in tests', () => {
		expect(rulesFor('test("run", async () => { await work() })', 'sample.test.ts')).not.toContain('no-async-await')
	})

	test('no-class for standalone classes', () => {
		expect(rulesFor('class User { constructor(readonly name: string) {} }')).toContain('no-class')
	})

	test('allows classes that extend external contracts', () => {
		expect(rulesFor("class Git extends Context.Service<Git>()('Git', {}) {}")).not.toContain('no-class')
		expect(rulesFor("class User extends Schema.Class<User>('User')({name: Schema.String}) {}")).not.toContain(
			'no-class'
		)
		expect(rulesFor('class TokenNode extends TextNode {}')).not.toContain('no-class')
	})

	test('no-restricted-global', () => {
		expect(typedRulesFor('const empty = Array.isArray(value)')).toContain('no-restricted-global')
		expect(typedRulesFor('const value = Math.max(left, right)')).not.toContain('no-restricted-global')
	})

	test('allows imported Effect modules with restricted global names', () => {
		expect(typedRulesFor("import {Array} from 'effect'; const empty = Array.isArray(value)")).not.toContain(
			'no-restricted-global'
		)
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

	test('no-deep-parent-chain', () => {
		expect(rulesFor('const grandparent = node.parent.parent')).toContain('no-deep-parent-chain')
		expect(rulesFor('const parent = node.parent')).not.toContain('no-deep-parent-chain')
	})

	test('no-ast-gettext-comparison', () => {
		expect(rulesFor("if (node.getText() === 'Array') { run() }")).toContain('no-ast-gettext-comparison')
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

	test('no-deprecated-api', () => {
		expect(
			typedRulesFor(`
				interface Api {
					/** @deprecated Use phaseModifier instead */
					phase: () => void
					phaseModifier: () => void
				}
				declare const api: Api
				api.phase()
			`)
		).toContain('no-deprecated-api')
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

	test('no-braced-single-line-guard', () => {
		expect(rulesFor('function read(node: Node) { if (!node.body) { return [] } return scan(node.body) }')).toContain(
			'no-braced-single-line-guard'
		)
	})

	test('no-unbraced-multiline-guard', () => {
		expect(
			rulesFor(`function read(node: Node) {
				if (node.body && node.body.statements && node.body.statements.length > 0)
					return scan(node.body)
			}`)
		).toContain('no-unbraced-multiline-guard')
		expect(rulesFor('function read(node: Node) { if (!node.body) return [] }')).not.toContain(
			'no-unbraced-multiline-guard'
		)
	})

	test('no-regex-literal', () => {
		expect(rulesFor('const testPattern = /test/')).toContain('no-regex-literal')
	})

	test('no-multiline-ternary', () => {
		expect(rulesFor("const value = enabled\n\t? 'yes'\n\t: 'no'")).toContain('no-multiline-ternary')
		expect(rulesFor("const value = enabled ? 'yes' : 'no'")).not.toContain('no-multiline-ternary')
		expect(
			rulesFor(
				`const view = <div>{
				enabled ? (
					<EnabledPanel />
				) : (
					<DisabledPanel />
				)
			}</div>`,
				'sample.tsx'
			)
		).not.toContain('no-multiline-ternary')
	})

	test('no-redundant-void-return', () => {
		expect(
			typedRulesFor(`
				function report(): void {}
				function run(value: boolean) {
					if (value) {
						report()
						return
					}
				}
			`)
		).toContain('no-redundant-void-return')
		expect(
			typedRulesFor(`
				function report(): void {}
				function read(): string | undefined {
					report()
					return
				}
			`)
		).not.toContain('no-redundant-void-return')
	})

	test('no-ternary-in-jsx', () => {
		expect(rulesFor('const node = active ? <Panel /> : null', 'sample.tsx')).toContain('no-ternary-in-jsx')
		expect(rulesFor('const node = <div>{active ? <Panel /> : null}</div>', 'sample.tsx')).toContain('no-ternary-in-jsx')
	})

	test('no-imperative-array-transform', () => {
		expect(rulesFor('for (const item of items) { result.push(item) }')).toContain('no-imperative-array-transform')
		expect(rulesFor('while (running) { tick() }')).toContain('no-imperative-array-transform')
	})

	test('allows null in JSON stringify replacer and React ref initialization', () => {
		expect(rulesFor('JSON.stringify(value, null, 2); const ref = useRef<HTMLDivElement | null>(null)')).not.toContain(
			'no-null-literal'
		)
	})

	test('no-length-check flags length access', () => {
		expect(typedRulesFor('const last = items.length - 1')).toContain('no-length-check')
	})

	test('no-top-level-mutable-singleton', () => {
		expect(rulesFor('let container = createContainer()')).toContain('no-top-level-mutable-singleton')
	})
})
