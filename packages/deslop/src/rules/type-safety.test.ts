import {Array} from 'effect'

import {expect, test} from 'bun:test'
import {analyzeTypedText} from '#lib/analyzer.ts'
import {expectRule} from './test-utils.ts'

test('no-type-assertion-except-as-const', () => {
	return expectRule({
		rule: 'no-type-assertion-except-as-const',
		source: 'declare const value: unknown\nconst user = value as User\n'
	})
})
test('prefer-strict-literal-const', () => {
	return expectRule({rule: 'prefer-strict-literal-const', source: 'const routes = { home: { path: "/" } }\n'})
})
test('prefer-readonly-types', () => {
	return expectRule({rule: 'prefer-readonly-types', source: 'type Props = { tags: string[] }\n'})
})
test('prefer-readonly-types reports non-ref current properties', () => {
	return expectRule({rule: 'prefer-readonly-types', source: 'type State = { current: string }\n'})
})
test('prefer-undefined-over-null', () => {
	return expectRule({rule: 'prefer-undefined-over-null', source: 'type Props = { readonly value: string | null }\n'})
})
test('prefer-undefined-over-null reports non-ref current properties', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		source: 'type Cursor = { readonly current: string | null }\n'
	})
})
test('prefer-undefined-over-null reports non-ref current assignments', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		typed: true,
		source: 'function reset(state: { readonly current: string | undefined }) { state.current = null }\n'
	})
})
test('no-any', () => {
	return expectRule({rule: 'no-any', source: 'function parse(value: any) { return value }\n'})
})
test('no-redundant-type-annotation', () => {
	return expectRule({rule: 'no-redundant-type-annotation', typed: true, source: 'const value: string = "value"\n'})
})
test('reports callback parameter annotation for concrete named contextual type', () => {
	const diagnostics = analyzeTypedText(
		'sample.ts',
		'type User = { readonly name: string }\ndeclare function onUser(callback: (user: User) => void): void\nonUser((user: User) => user.name)\n'
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).toContain('no-callback-parameter-type-annotation')
})
test('no-redundant-generic-type-argument', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'function identity<T>(value: T) { return value }\nconst value = identity<string>("value")\n'
	})
})
test('no-redundant-generic-type-argument reports local use-prefixed functions', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'function useValue<T>(value: T) { return value }\nconst value = useValue<string>("value")\n'
	})
})
test('no-redundant-generic-type-argument reports shadowed effect module names', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'const Array = { first<T>(value: T) { return value } }\nconst value = Array.first<string>("value")\n'
	})
})
test('no-unnecessary-type-constraint', () => {
	return expectRule({
		rule: 'no-unnecessary-type-constraint',
		source: 'function identity<T extends unknown>(value: T) { return value }\n'
	})
})
test('no-redundant-type-system-check', () => {
	return expectRule({
		rule: 'no-redundant-type-system-check',
		typed: true,
		source: 'function view(props: { readonly name: string }) { return props.name ?? "anonymous" }\n'
	})
})
test('no-floating-type-contract', () => {
	return expectRule({
		rule: 'no-floating-type-contract',
		source: 'type Input = { readonly name: string }\nfunction create(input: Input) { return input.name }\n'
	})
})
test('no-broad-literal-annotation', () => {
	return expectRule({
		rule: 'no-broad-literal-annotation',
		source: 'const routes: Record<string, { readonly path: string }> = { home: { path: "/" } }\n'
	})
})
test('no-effect-type-erasure', () => {
	return expectRule({
		rule: 'no-effect-type-erasure',
		source: 'import {Effect} from "effect"\ntype Program = Effect.Effect<string>\n'
	})
})
