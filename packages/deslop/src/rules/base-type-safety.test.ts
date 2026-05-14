import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('prefer-readonly-types reports mutable object and array types', () => {
	return expectRule({
		rule: 'prefer-readonly-types',
		source: 'type User = { name: string; tags: string[] }\n'
	})
})

test('prefer-readonly-types allows mutable React RefObject values', () => {
	return expectNoRule({
		rule: 'prefer-readonly-types',
		source: 'type ItemsRef = React.RefObject<string[]>\n'
	})
})

test('prefer-undefined-over-null reports null as an absence value', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		source: 'type State = { readonly user: User | null }\n'
	})
})

test('prefer-undefined-over-null allows React ref null initializers', () => {
	return expectNoRule({
		rule: 'prefer-undefined-over-null',
		filePath: 'sample.tsx',
		typed: true,
		source: 'import {useRef} from "react"\nconst elementRef = useRef<HTMLDivElement>(null)\n'
	})
})

test('prefer-optional-property reports properties unioned with undefined', () => {
	return expectRule({
		rule: 'prefer-optional-property',
		source: 'type Props = { readonly title: string | undefined }\n'
	})
})

test('no-redundant-type-syntax reports annotations TypeScript can infer', () => {
	return expectRule({
		rule: 'no-redundant-type-syntax',
		typed: true,
		source: 'const name: string = "Ada"\nfunction label(): string { return name }\n'
	})
})

test('no-redundant-type-syntax reports explicit generic call arguments', () => {
	return expectRule({
		rule: 'no-redundant-type-syntax',
		typed: true,
		source: 'function identity<T>(value: T) { return value }\nconst name = identity<string>("Ada")\n'
	})
})

test('no-redundant-type-syntax reports property callback parameter annotations', () => {
	return expectRule({
		rule: 'no-redundant-type-syntax',
		typed: true,
		source:
			'type Handlers = { readonly LintFailure: (error: Error) => void }\ndeclare function catchTags(handlers: Handlers): void\ncatchTags({ LintFailure: (error: Error) => { console.log(error.message) } })\n'
	})
})

test('no-redundant-type-syntax allows useRef generic arguments', () => {
	return expectNoRule({
		rule: 'no-redundant-type-syntax',
		filePath: 'sample.tsx',
		typed: true,
		source: 'import {useRef} from "react"\nconst names = useRef<readonly string[]>([])\n'
	})
})

test('no-redundant-type-syntax allows annotations needed by Effect.fnUntraced', () => {
	return expectNoRule({
		rule: 'no-redundant-type-syntax',
		typed: true,
		source: 'import {Effect} from "effect"\nconst greet = Effect.fnUntraced(function* (name: string) { return name })\n'
	})
})

test('no-redundant-type-system-check reports unreachable nullish fallbacks', () => {
	return expectRule({
		rule: 'no-redundant-type-system-check',
		typed: true,
		source: 'function label(name: string) { return name ?? "anonymous" }\n'
	})
})

test('no-redundant-type-system-check allows optional chains that can be undefined', () => {
	return expectNoRule({
		rule: 'no-redundant-type-system-check',
		typed: true,
		source: 'function label(user?: { readonly name: string }) { return user?.name ?? "anonymous" }\n'
	})
})

test('no-unnecessary-named-type reports local aliases with little reuse', () => {
	return expectRule({
		rule: 'no-unnecessary-named-type',
		source: 'type User = { readonly name: string }\nfunction greet(user: User) { return user.name }\n'
	})
})

test('no-unnecessary-named-type allows same-name runtime companion aliases', () => {
	return expectNoRule({
		rule: 'no-unnecessary-named-type',
		source: 'export type User = typeof User.Type\nexport const User = { Type: "user" }\n'
	})
})
