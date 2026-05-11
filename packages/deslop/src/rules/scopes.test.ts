import {Array, String} from 'effect'

import {expect, test} from 'bun:test'
import {analyzeText} from '#lib/analyzer.ts'
import {expectRule} from './test-utils.ts'

test('base scope emits public planned rule ids', () => {
	return expectRule({
		rule: 'base/no-destructuring',
		scoped: true,
		scopes: ['base'],
		source:
			'function view(props: { readonly user: { readonly name: string } }) { const { user } = props; return user.name }\n'
	})
})

test('react scope emits public planned rule ids', () => {
	return expectRule({
		rule: 'react/no-jsx-props-object',
		filePath: 'sample.tsx',
		scoped: true,
		scopes: ['react'],
		source: 'function View(props: { readonly value: string }) { return <Input {...props} /> }\n'
	})
})

test('effect scope emits public planned rule ids', () => {
	return expectRule({
		rule: 'effect/no-option-constructor',
		scoped: true,
		scopes: ['effect'],
		source: 'import {Option} from "effect"\nconst value = Option.fromNullable(input)\n'
	})
})

test('scopes are explicit allowlists', () => {
	const diagnostics = analyzeText(
		'sample.tsx',
		'import {Option} from "effect"\nfunction View(props: { readonly value: string }) { const { value } = props; const option = Option.fromNullable("value"); return <Input {...props} /> }\n',
		['base'],
		true
	)
	const rules = Array.map(diagnostics, diagnostic => diagnostic.rule)
	expect(Array.some(rules, String.startsWith('base/'))).toBe(true)
	expect(Array.some(rules, String.startsWith('react/'))).toBe(false)
	expect(Array.some(rules, String.startsWith('effect/'))).toBe(false)
})
