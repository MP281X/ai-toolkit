import {test} from 'bun:test'
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
test('prefer-undefined-over-null', () => {
	return expectRule({rule: 'prefer-undefined-over-null', source: 'type Props = { readonly value: string | null }\n'})
})
test('no-any', () => {
	return expectRule({rule: 'no-any', source: 'function parse(value: any) { return value }\n'})
})
test('no-redundant-type-annotation', () => {
	return expectRule({rule: 'no-redundant-type-annotation', typed: true, source: 'const value: string = "value"\n'})
})
test('no-redundant-generic-type-argument', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'function identity<T>(value: T) { return value }\nconst value = identity<string>("value")\n'
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
