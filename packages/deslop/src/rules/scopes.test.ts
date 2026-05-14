import {expect, test} from 'bun:test'

import {Array, String} from 'effect'

import {expectRule} from './test-utils.ts'

import {analyzeText} from '#lib/analyzer.ts'

test('base scope emits public planned rule ids', () =>
	expectRule({
		rule: 'base/no-simple-local-binding',
		scoped: true,
		scopes: ['base'],
		source: 'function view(props: { readonly value: string }) { const ready = props.value === "ready"; return ready }\n'
	}))

test('react scope emits public planned rule ids', () =>
	expectRule({
		filePath: 'sample.tsx',
		rule: 'react/no-jsx-props-object',
		scoped: true,
		scopes: ['react'],
		source: 'function View(props: { readonly value: string }) { return <Input {...props} /> }\n'
	}))

test('effect scope emits public planned rule ids', () =>
	expectRule({
		rule: 'effect/no-option-constructor',
		scoped: true,
		scopes: ['effect'],
		source: 'import {Option} from "effect"\nconst value = Option.fromNullable(input)\n'
	}))

test('scopes are explicit allowlists', () => {
	const rules = Array.map(
		analyzeText(
			'sample.tsx',
			'import {Option} from "effect"\nfunction View(props: { readonly value: string }) { const ready = props.value === "ready"; const option = Option.fromNullable("value"); return <Input {...props} ready={ready} /> }\n',
			['base'],
			true
		),
		diagnostic => diagnostic.rule
	)
	expect(Array.some(rules, String.startsWith('base/'))).toBe(true)
	expect(Array.some(rules, String.startsWith('react/'))).toBe(false)
	expect(Array.some(rules, String.startsWith('effect/'))).toBe(false)
})
