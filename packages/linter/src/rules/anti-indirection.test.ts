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

	test('no-access-variable for non-null aliases', () => {
		expect(rulesFor('const currentEntry = selectedEntry!')).toContain('no-access-variable')
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

	test('no-signature-wrapper for declarations', () => {
		expect(rulesFor('function run(options: Options) { return Effect.runPromise(runEffect(options)) }')).toContain(
			'no-signature-wrapper'
		)
	})

	test('allows named predicate wrappers around collection checks', () => {
		expect(
			rulesFor('function isAlwaysTruthy(type: Type) { return typeParts(type).every(part => isTruthy(part)) }')
		).not.toContain('no-signature-wrapper')
	})

	test('allows named helpers around pipe transforms', () => {
		expect(rulesFor('function diagnosticText(node: Node) { return pipe(node.text, String.trim) }')).not.toContain(
			'no-signature-wrapper'
		)
	})

	test('allows single-use hook variables in components', () => {
		expect(rulesFor('function Screen() { const params = Route.useParams(); return params.id }')).not.toContain(
			'no-single-use-variable'
		)
	})

	test('still flags single-use non-hook call variables in components', () => {
		expect(rulesFor('function Screen() { const params = Route.getParams(); return params.id }')).toContain(
			'no-single-use-variable'
		)
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

	test('allows css constants with Tailwind-like tokens', () => {
		expect(rulesFor('const DIFF_CSS = `:host { --gap-token: flex; border: 1px solid red; }`')).not.toContain(
			'no-tailwind-class-variables'
		)
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

	test('no-effect-antipatterns for named function Effect.gen wrappers', () => {
		expect(rulesFor('function runEffect() { return Effect.gen(function* () { return yield* work }) }')).toContain(
			'no-effect-antipatterns'
		)
	})

	test('no-effect-antipatterns for direct Effect.gen constants', () => {
		expect(rulesFor('const cli = Effect.gen(function* () { return yield* work })')).toContain('no-effect-antipatterns')
	})

	test('allows top-level variables used more than once', () => {
		expect(
			rulesFor('const compilerOptions = {strict: true}; ts.createProgram(files, compilerOptions); use(compilerOptions)')
		).not.toContain('no-single-use-top-level-variable')
	})

	test('allows top-level arrays that are not compositions', () => {
		expect(rulesFor('const sourceFileExtensions = [".ts", ".tsx"]; use(sourceFileExtensions)')).not.toContain(
			'no-single-use-top-level-variable'
		)
	})

	test('no-single-use-top-level-variable', () => {
		expect(rulesFor('const ruleRegistry = [...a, ...b, ...c]; run(ruleRegistry)')).toContain(
			'no-single-use-top-level-variable'
		)
	})
})
