import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('prefer-readonly-types reports mutable object and array types', () => {
	expectRule({
		rule: 'prefer-readonly-types',
		source: 'type User = { name: string; tags: string[] }\n'
	})
})

test('prefer-readonly-types allows mutable React RefObject values', () => {
	expectNoRule({
		rule: 'prefer-readonly-types',
		source: 'type ItemsRef = React.RefObject<string[]>\n'
	})
})

test('prefer-undefined-over-null reports null as an absence value', () => {
	expectRule({
		rule: 'prefer-undefined-over-null',
		source: 'type State = { readonly user: User | null }\n'
	})
})

test('prefer-undefined-over-null allows React ref null initializers', () => {
	expectNoRule({
		filePath: 'sample.tsx',
		rule: 'prefer-undefined-over-null',
		source: 'import {useRef} from "react"\nconst elementRef = useRef<HTMLDivElement>(null)\n',
		typed: true
	})
})

test('prefer-optional-property reports properties unioned with undefined', () => {
	expectRule({
		rule: 'prefer-optional-property',
		source: 'type Props = { readonly title: string | undefined }\n'
	})
})

test('no-redundant-type-syntax reports annotations TypeScript can infer', () => {
	expectRule({
		rule: 'no-redundant-type-syntax',
		source: 'const name: string = "Ada"\nfunction label(): string { return name }\n',
		typed: true
	})
})

test('no-redundant-type-syntax reports explicit generic call arguments', () => {
	expectRule({
		rule: 'no-redundant-type-syntax',
		source: 'function identity<T>(value: T) { return value }\nconst name = identity<string>("Ada")\n',
		typed: true
	})
})

test('no-redundant-type-syntax reports property callback parameter annotations', () => {
	expectRule({
		rule: 'no-redundant-type-syntax',
		source:
			'type Handlers = { readonly LintFailure: (error: Error) => void }\ndeclare function catchTags(handlers: Handlers): void\ncatchTags({ LintFailure: (error: Error) => { console.log(error.message) } })\n',
		typed: true
	})
})

test('no-redundant-type-syntax allows useRef generic arguments', () => {
	expectNoRule({
		filePath: 'sample.tsx',
		rule: 'no-redundant-type-syntax',
		source: 'import {useRef} from "react"\nconst names = useRef<readonly string[]>([])\n',
		typed: true
	})
})

test('no-redundant-type-syntax allows annotations needed by Effect.fnUntraced', () => {
	expectNoRule({
		rule: 'no-redundant-type-syntax',
		source:
			'import {Effect} from "effect"\nconst greet = Effect.fnUntraced(function* (name: string) { return name })\n',
		typed: true
	})
})

test('no-redundant-type-system-check reports unreachable nullish fallbacks', () => {
	expectRule({
		rule: 'no-redundant-type-system-check',
		source: 'function label(name: string) { return name ?? "anonymous" }\n',
		typed: true
	})
})

test('no-redundant-type-system-check allows optional chains that can be undefined', () => {
	expectNoRule({
		rule: 'no-redundant-type-system-check',
		source: 'function label(user?: { readonly name: string }) { return user?.name ?? "anonymous" }\n',
		typed: true
	})
})

test('no-unnecessary-named-type reports local aliases with little reuse', () => {
	expectRule({
		rule: 'no-unnecessary-named-type',
		source: 'type User = { readonly name: string }\nfunction greet(user: User) { return user.name }\n'
	})
})

test('no-unnecessary-named-type allows same-name runtime companion aliases', () => {
	expectNoRule({
		rule: 'no-unnecessary-named-type',
		source: 'export type User = typeof User.Type\nexport const User = { Type: "user" }\n'
	})
})
