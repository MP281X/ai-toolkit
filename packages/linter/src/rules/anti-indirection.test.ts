import {Array, pipe} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string) {
	return pipe(
		StrictLinter.analyzeText('sample.ts', sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
}

describe('anti-indirection rules', () => {
	test('no-access-variable', () => {
		expect(rulesFor('const name = user.profile.name')).toContain('no-access-variable')
	})

	test('no-simple-condition-variable', () => {
		expect(rulesFor("const active = status === 'active'")).toContain('no-simple-condition-variable')
	})

	test('no-derived-simple-variable', () => {
		expect(rulesFor(`const href = \`/users/${'${'}user.id}\``)).toContain('no-derived-simple-variable')
	})

	test('no-single-use-variable', () => {
		expect(rulesFor('function run() { const value = getValue(); save(value) }')).toContain('no-single-use-variable')
	})

	test('no-access-helper', () => {
		expect(rulesFor('function getName(user: {name: string}) { return user.name }')).toContain('no-access-helper')
	})

	test('no-one-line-function', () => {
		expect(rulesFor('const getValue = () => value + 1')).toContain('no-one-line-function')
	})

	test('no-simple-function-variables', () => {
		expect(rulesFor('const getLabel = () => label')).toContain('no-simple-function-variables')
	})

	test('no-single-expression-function', () => {
		expect(rulesFor('const getValue = () => value + 1; save(getValue())')).toContain('no-single-expression-function')
	})

	test('no-signature-wrapper', () => {
		expect(rulesFor('const getUser = (id: string) => api.user.get(id)')).toContain('no-signature-wrapper')
	})

	test('no-pass-through-function', () => {
		expect(rulesFor('const saveName = (name: string) => save(name)')).toContain('no-pass-through-function')
	})

	test('no-call-shape-adapter', () => {
		expect(rulesFor('const saveName = (name: string) => save({name})')).toContain('no-call-shape-adapter')
	})

	test('no-helper-branch-growth', () => {
		expect(
			rulesFor(
				"const getLabel = (item: {name?: string; title?: string}) => { if (item.name) return item.name; if (item.title) return item.title; return 'Unknown' }"
			)
		).toContain('no-helper-branch-growth')
	})

	test('no-union-normalizer-helper', () => {
		expect(
			rulesFor(
				"const getLabel = (item: {name?: string; title?: string}) => { if (item.name) return item.name; if (item.title) return item.title; return 'Unknown' }"
			)
		).toContain('no-union-normalizer-helper')
	})

	test('no-configurable-helper', () => {
		expect(rulesFor("const getLabel = (value: string, fallback = 'Unknown') => value || fallback")).toContain(
			'no-configurable-helper'
		)
	})

	test('no-primitive-const', () => {
		expect(rulesFor('const limit = 3')).toContain('no-primitive-const')
	})

	test('no-arg-destructuring', () => {
		expect(rulesFor('function save({name}: {name: string}) { return name }')).toContain('no-arg-destructuring')
	})

	test('no-arg-destructuring in callbacks', () => {
		expect(rulesFor('items.map(({name}) => name)')).toContain('no-arg-destructuring')
	})

	test('no-return-type-annotation in callbacks', () => {
		expect(rulesFor('items.map((item): string => item.name)')).toContain('no-return-type-annotation')
	})

	test('no-arrow-for-named', () => {
		expect(rulesFor('const submit = () => save()')).toContain('no-arrow-for-named')
	})
})
