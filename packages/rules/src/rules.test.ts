import {Array} from 'effect'

import {describe, expect, test} from 'vite-plus/test'

import {rules} from './rules.ts'

import {runRule} from '#lib/test-utils.ts'

function messages(ruleName: keyof typeof rules, code: string, filename = 'fixture.tsx') {
	return Array.map(runRule(rules[ruleName], code, {filename}), diagnostic => diagnostic.message)
}

function expectDiagnostic(ruleName: keyof typeof rules, code: string, filename = 'fixture.tsx') {
	expect(messages(ruleName, code, filename)).not.toEqual([])
}

function expectClean(ruleName: keyof typeof rules, code: string, filename = 'fixture.tsx') {
	expect(messages(ruleName, code, filename)).toEqual([])
}

describe('@deslop/rules effect boundaries', () => {
	test('bans Effect error erasure', () => {
		expectDiagnostic('no-effect-error-to-success', 'Effect.either(task)')
		expectDiagnostic('no-effect-error-to-success', 'Effect.exit(task)')
		expectDiagnostic('no-effect-error-to-success', 'Effect.ignore(task)')
		expectDiagnostic('no-effect-error-to-success', 'Effect.orElseSucceed(task, () => [])')
		expectDiagnostic('no-effect-error-to-success', 'Effect.result(task)')
		expectDiagnostic('no-effect-error-to-success', "Effect.catchTag(task, 'GitError', () => Effect.succeed([]))")
		expectClean('no-effect-error-to-success', 'Effect.mapError(task, error => new GitError({cause: error}))')
	})

	test('bans Effect run methods outside tests', () => {
		expectDiagnostic('no-effect-run-in-source', 'Effect.runPromise(program)', 'source.ts')
		expectClean('no-effect-run-in-source', 'Effect.runPromise(program)', 'source.test.ts')
	})

	test('bans schema decoders that erase failures', () => {
		expectDiagnostic('no-schema-erasing-decode', 'Schema.decodeUnknownOption(PackageJson)(value)')
		expectClean('no-schema-erasing-decode', 'Schema.decodeUnknownEffect(PackageJson)(value)')
	})

	test('bans Config.orElse', () => {
		expectDiagnostic('no-config-or-else', 'Config.orElse(Config.string("SHELL"), () => Config.succeed("bash"))')
		expectClean('no-config-or-else', 'Config.withDefault(Config.string("SHELL"), "bash")')
	})
})

describe('@deslop/rules direct code style', () => {
	test('bans prototype methods with Effect equivalents', () => {
		expectDiagnostic('no-prototype-effect-equivalent', 'items.map(item => item.id)')
		expectClean('no-prototype-effect-equivalent', 'Array.map(items, item => item.id)')
		expectClean('no-prototype-effect-equivalent', "import path from 'node:path'; path.join(home, '.deslop')")
		expectClean('no-prototype-effect-equivalent', "const path = yield* Path.Path; path.join(home, '.deslop')")
		expect(messages('no-prototype-effect-equivalent', "url.hostname.split('.').slice(1).join('.')")).toHaveLength(1)
	})

	test('bans object destructuring and access aliases', () => {
		expectDiagnostic('no-object-destructuring', 'function View({id}) { return id }')
		expectClean('no-object-destructuring', 'const [state, send] = useAtom(atom)')
		expectDiagnostic('no-access-alias', 'const cwd = input.project.worktree.cwd')
		expectClean('no-access-alias', 'const rect = element.getBoundingClientRect()')
		expectClean('no-access-alias', 'export const useForm = formHook.useAppForm')
	})

	test('bans import renames', () => {
		expectDiagnostic('no-import-rename', "import {FileDiff as PierreFileDiff} from '@pierre/diffs/react'")
		expectClean('no-import-rename', "import {FileDiff} from '@pierre/diffs/react'")
	})

	test('bans type assertions except as const', () => {
		expectDiagnostic('no-type-assertion-except-as-const', 'const value = input as PackageJson')
		expectClean('no-type-assertion-except-as-const', "const value = ['a'] as const")
	})

	test('bans local type annotations', () => {
		expectDiagnostic('no-local-type-annotation', 'const value: string = input')
		expectDiagnostic('no-local-type-annotation', 'const local = (): string => input')
		expectDiagnostic('no-local-type-annotation', 'function local(): string { return input }')
		expectClean('no-local-type-annotation', 'const value = input')
	})

	test('bans let declarations', () => {
		expectDiagnostic('no-let', 'let current = input')
		expectDiagnostic('no-let', 'for (let index = 0; index < items.length; index += 1) process(items[index])')
		expectClean('no-let', 'const current = input')
	})

	test('bans local type aliases', () => {
		expectDiagnostic('no-local-type-alias', 'type LocalInput = {readonly id: string}; save(input)')
		expectClean('no-local-type-alias', 'export type PublicInput = {readonly id: string}')
		expectClean('no-local-type-alias', 'class User extends Schema.Class<User>("User")({id: Schema.String}) {}')
	})

	test('bans top-level constant data aliases', () => {
		expectDiagnostic(
			'no-top-level-constant-data',
			'const ignored = ["node_modules"]; export function run() { return ignored }'
		)
		expectDiagnostic(
			'no-top-level-constant-data',
			'const matcher = /test/u; export function run(value) { return matcher.test(value) }'
		)
		expectDiagnostic(
			'no-top-level-constant-data',
			'const values = new Set(["a"]); export function run(value) { return values.has(value) }'
		)
		expectClean('no-top-level-constant-data', 'export const command = createCommand({name: "run"})')
		expectClean('no-top-level-constant-data', 'export function run() { return Array.contains(["a"], "a") }')
	})

	test('bans top-level Schema.Struct aliases', () => {
		expectDiagnostic('no-top-level-schema-struct', 'const User = Schema.Struct({id: Schema.String})')
		expectDiagnostic('no-top-level-schema-struct', 'export const User = Schema.Struct({id: Schema.String})')
		expectClean('no-top-level-schema-struct', 'class User extends Schema.Class<User>("User")({id: Schema.String}) {}')
		expectClean(
			'no-top-level-schema-struct',
			'export function decode(value) { return Schema.decodeUnknown(Schema.Struct({id: Schema.String}))(value) }'
		)
	})

	test('bans signature-only wrappers', () => {
		expectDiagnostic('no-signature-wrapper', 'const makeUser = input => User.make(input)')
		expectDiagnostic('no-signature-wrapper', 'function makeUser(input) { return User.make(input) }')
		expectClean('no-signature-wrapper', 'const matches = value => /^x/u.test(value)')
		expectClean('no-signature-wrapper', 'const toGitError = error => new GitError({cause: error})')
		expectClean('no-signature-wrapper', 'class TokenNode { static importJSON(node) { return new TokenNode(node) } }')
	})

	test('bans pipe with only one transformation', () => {
		expectDiagnostic('no-two-argument-pipe', 'pipe(items, Array.map(item => item.id))')
		expectClean('no-two-argument-pipe', 'Array.map(items, item => item.id)')
		expectClean('no-two-argument-pipe', 'pipe(items, Array.filter(Boolean), Array.map(item => item.id))')
		expectClean('no-two-argument-pipe', 'Match.value(value).pipe(Match.when("a", () => 1), Match.orElse(() => 2))')
	})
})

describe('@deslop/rules React and call inputs', () => {
	test('bans className indirection', () => {
		expectDiagnostic('no-classname-variable', "const rowClassName = cn('grid', active && 'bg')")
		expectDiagnostic('no-classname-indirection', '<div className={rowClassName} />')
		expectClean('no-classname-indirection', "<div className={cn('grid', active && 'bg')} />")
	})

	test('requires inline call inputs', () => {
		expectDiagnostic('prefer-inline-call-input', 'const request = {id}; send(request)')
		expectClean('prefer-inline-call-input', 'send({id})')
	})

	test('bans useAtomSet', () => {
		expectDiagnostic('prefer-use-atom-tuple', "useAtomSet(saveAtom, {mode: 'promise'})")
		expectDiagnostic('prefer-use-atom-tuple', 'useAtomSet(saveAtom)')
		expectClean('prefer-use-atom-tuple', 'const [state, save] = useAtom(saveAtom)')
		expectClean('prefer-use-atom-tuple', 'const state = useAtomSuspense(loadAtom)')
	})

	test('bans Promise catch and finally in source', () => {
		expectDiagnostic('no-promise-catch-finally', 'save().catch(error => report(error))', 'source.ts')
		expectDiagnostic('no-promise-catch-finally', 'save().finally(cleanup)', 'source.ts')
		expectClean('no-promise-catch-finally', 'save().catch(error => report(error))', 'source.test.ts')
	})

	test('bans service layer mocks outside tests', () => {
		expectDiagnostic('no-layer-mock', 'Git.layerMock({status: () => Effect.succeed([])})', 'source.ts')
		expectDiagnostic(
			'no-layer-mock',
			'class Git extends Context.Service<Git>()("Git", { layerMock: () => layer }) {}',
			'source.ts'
		)
		expectClean('no-layer-mock', 'Git.layerMock({status: () => Effect.succeed([])})', 'source.test.ts')
	})

	test('bans optimistic atoms', () => {
		expectDiagnostic('no-optimistic-atom', 'Atom.optimistic(baseAtom, reducer)')
		expectDiagnostic('no-optimistic-atom', 'Atom.optimisticFn(baseAtom, reducer)')
		expectClean('no-optimistic-atom', 'Atom.fn(effect)')
	})

	test('bans direct _tag access and construction in source', () => {
		expectDiagnostic('no-direct-tag-field', 'value._tag', 'source.ts')
		expectDiagnostic('no-direct-tag-field', "const target = {_tag: 'commit', hash}", 'source.ts')
		expectDiagnostic('no-direct-tag-field', "type Target = {readonly _tag: 'commit'}", 'source.ts')
		expectClean('no-direct-tag-field', "Match.value(value).pipe(Match.tag('commit', value => value.hash))", 'source.ts')
		expectClean('no-direct-tag-field', 'const target = gitReviewCommitTarget(hash)', 'source.ts')
		expectClean('no-direct-tag-field', "const schema = Schema.Struct({_tag: Schema.Literal('commit')})", 'schema.ts')
		expectClean('no-direct-tag-field', "expect(error._tag).toBe('GitError')", 'source.test.ts')
	})
})
