import {spawnSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {assert, describe, it} from '@effect/vitest'

import {Array, Schema, String, pipe} from 'effect'

const Diagnostic = Schema.Struct({
	code: Schema.String,
	labels: Schema.Array(Schema.Struct({span: Schema.Struct({line: Schema.Number})})),
	message: Schema.String
})
const OxlintOutput = Schema.Struct({diagnostics: Schema.Array(Diagnostic)})

const vitePlusPackage = fileURLToPath(import.meta.resolve('vite-plus/package.json'))
const resolveFromVitePlus = createRequire(vitePlusPackage)
const oxlintPackage = resolveFromVitePlus.resolve('oxlint/package.json')
const oxlintBinary = join(dirname(oxlintPackage), 'bin/oxlint')
const pluginPath = fileURLToPath(new URL('./oxlint-plugin.ts', import.meta.url))

function lintRules(rules: readonly string[], source: string, filename = 'fixture.ts') {
	const directory = mkdtempSync(join(tmpdir(), 'deslop-oxlint-'))
	const configPath = join(directory, '.oxlintrc.json')
	const sourcePath = join(directory, filename)
	const ruleConfig = pipe(
		rules,
		Array.map(rule => `"@deslop/oxlint-rules/${rule}":"error"`),
		Array.join(',')
	)
	writeFileSync(
		configPath,
		`{"jsPlugins":[{"name":"@deslop/oxlint-rules","specifier":"${pluginPath}"}],"rules":{${ruleConfig}}}`
	)
	writeFileSync(sourcePath, source)
	const result = spawnSync(oxlintBinary, [
		'-A',
		'all',
		'--config',
		configPath,
		'--format',
		'json',
		'--no-ignore',
		sourcePath
	])
	try {
		return Schema.decodeUnknownSync(Schema.fromJsonString(OxlintOutput))(result.stdout.toString()).diagnostics
	} finally {
		rmSync(directory, {force: true, recursive: true})
	}
}

function lint(rule: string, source: string, filename = 'fixture.ts') {
	return lintRules([rule], source, filename)
}

const cases = [
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Type Atom.family argument.',
		rule: 'no-atom-family-inferred-arg',
		source: `import {Atom as Reactive} from 'effect/unstable/reactivity'
Reactive.family(value => value)
Reactive.family((value: string) => value)`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Keep module augmentation declarations local.',
		rule: 'no-declare-module-export',
		source: `declare module 'effect' {
export type Register = {readonly value: string}
type Local = string
}`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use Effect.fn for functions returning Effect.',
		rule: 'no-effect-returning-function',
		source: `import {Effect as Fx} from 'effect'
function invalid(value: string) { return Fx.succeed(value) }
const valid = Fx.fn(function* (value: string) { return value })`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use a real ref or the lazy ref/value pattern.',
		rule: 'no-fake-ref-state',
		source: `import {useState as state} from 'react'
state(() => ({current: 0}))
state(() => ({current: 0, status: 'owned'}))`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Keep mutable state inside a runtime owner.',
		rule: 'no-module-mutable-state',
		source: `export const state = {value: 0}
state.value = 1
function valid() { const local = {value: 0}; local.value = 1; return local }`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Use Effect data structures or domain state.',
		rule: 'no-native-mutable-collection',
		source: `const invalid = new Map()
function valid(Map: new () => object) { return new Map() }`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use Effect module functions.',
		rule: 'no-native-prototype-method',
		source: `const values = [1, 2]
values.map(value => value + 1)
service.map(value)`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Use Predicate for nullish checks.',
		rule: 'no-nullish-comparison',
		source: `value !== undefined
function valid(undefined: unknown) { return value !== undefined }`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Use exact optional properties.',
		rule: 'no-optional-undefined-property',
		source: `type Invalid = {value?: (string | undefined)}
type Valid = {value?: string}`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Use public package exports.',
		rule: 'no-private-workspace-import',
		source: `void import('@deslop/git/src/service')
void import('@deslop/git')
void import('./service')`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use schema constructors for tagged values.',
		rule: 'no-raw-tagged-object',
		source: `import {Schema} from 'effect'
const invalid = {_tag: 'Invalid'}
const valid = Schema.Struct({_tag: Schema.Literal('Valid')})`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use runtime or atom entrypoints.',
		rule: 'no-restricted-library-api',
		source: `import {Effect as Fx} from 'effect'
Fx.runPromise(Fx.void)
function valid(Effect: {runPromise: () => void}) { Effect.runPromise() }`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Use Effect.gen for nullary work.',
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect as Fx} from 'effect'
const invalid = Fx.fn('invalid')(function* () { return 1 })
const valid = Fx.fn('valid')(function* (value: number) { return value })`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 2,
		message: 'Inline schema decoding.',
		rule: 'no-schema-decoder-alias',
		source: `import {Schema as S} from 'effect'
const invalid = S.decodeSync(S.String)
const valid = S.decodeSync(S.String)('value')`
	},
	{
		filename: 'fixture.schema.ts',
		invalidLine: 2,
		message: 'Add a matching schema type alias with the same export visibility.',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
export const Invalid = Schema.String
type Valid = typeof Valid.Type
const Valid = Schema.String`
	},
	{
		filename: 'fixture.ts',
		invalidLine: 1,
		message: 'Use Match for repeated discriminant branches.',
		rule: 'prefer-match',
		source: `if (value.kind === 'one') one(); else if (value.kind === 'two') two()
if (left.kind === 'one') one(); if (right.kind === 'two') two()`
	}
] as const

const adversarialCases = [
	{
		expected: 0,
		rule: 'no-atom-family-inferred-arg',
		source: `import {Atom} from 'effect/unstable/reactivity'
Atom.family((value: string = '') => value)`
	},
	{
		expected: 0,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
function valid() { const state = {value: 1}; state.value = 2; return state }`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
function mutate() { state.value = 1 }`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
const alias = state
alias.value = 1`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import {useState as state} from 'react'
state(() => new Map())`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
function invalid(useState: (value: unknown) => unknown) { return useState(() => new Map()) }`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
const state = useState
state(() => new Map())`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
export const User = Schema.String.pipe(Schema.brand('User'))`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
export type User = typeof User.Type
const User = Schema.String`
	},
	{
		expected: 0,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
const User = Schema.String.ast`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
function invalid(value: string) { return Effect.succeed(value) as Effect.Effect<string> }`
	},
	{expected: 1, rule: 'no-native-prototype-method', source: `const invalid = ([1] as number[]).map(value => value)`},
	{
		expected: 1,
		rule: 'no-raw-tagged-object',
		source: `import {Match} from 'effect'
Match.value({_tag: 'Raw'})`
	},
	{
		expected: 1,
		rule: 'no-fake-ref-state',
		source: `import {useState} from 'react'
useState(() => ({'current': 0}))`
	},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import {Schema} from 'effect'
const decode = Schema.decodeSync`
	},
	{expected: 1, rule: 'prefer-match', source: `if ('one' === value.kind) one(); else if ('two' === value.kind) two()`},
	{
		expected: 1,
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect} from 'effect'
Effect.fn('invalid')(function* () { yield* Effect.succeed(1) })`
	},
	{
		expected: 1,
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect} from 'effect'
Effect.fn('invalid')(() => Effect.gen(function* () { yield* Effect.succeed(1) }))`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
const first = state
const second = first
second.value = 1`
	},
	{
		expected: 0,
		rule: 'no-module-mutable-state',
		source: `const queue = {push() { return 1 }}
queue.push()`
	},
	{expected: 0, rule: 'prefer-match', source: `if (next() === 'one') one(); else if (next() === 'two') two()`},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import {Schema} from 'effect'
const {decodeSync} = Schema`
	},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import {Schema} from 'effect'
const decode = Schema['decodeSync']`
	},
	{
		expected: 1,
		rule: 'no-raw-tagged-object',
		source: `import {Match} from 'effect'
Match.when({_tag: 'A'}, () => ({_tag: 'B'}))`
	},
	{
		expected: 0,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
const Value = Schema.decodeSync(Schema.String)('ok')`
	},
	{
		expected: 0,
		rule: 'no-native-prototype-method',
		source: `type Service = {map: (f: (value: number) => number) => number}
declare const service: Service
let values: number[] | Service = [1]
values = service
values.map(value => value)`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import * as React from 'react'
const ref = React.useRef
ref(new Map())`
	},
	{
		expected: 1,
		rule: 'no-atom-family-inferred-arg',
		source: `import {Atom} from 'effect/unstable/reactivity'
const A = Atom
A.family(value => value)`
	},
	{
		expected: 1,
		rule: 'no-fake-ref-state',
		source: `import {useState} from 'react'
const state = useState
state(() => ({current: 0}))`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {items: []}
state.items.push('value')`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 1}
delete state.value`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
let Fx = Effect
Fx = service
function valid(value: string) { return Fx.succeed(value) }`
	},
	{
		expected: 0,
		rule: 'no-fake-ref-state',
		source: `import {useState} from 'react'
let state = useState
state = service
state(() => ({current: 0}))`
	},
	{
		expected: 0,
		rule: 'no-schema-decoder-alias',
		source: `import {Schema} from 'effect'
let S = Schema
S = service
const decode = S.decodeSync`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import * as React from 'react'
const R = React
R.useState(() => new Map())`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import * as React from 'react'
let R = React
R = service
R.useState(() => new Map())`
	},
	{
		expected: 0,
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect} from 'effect'
Effect.gen(function* () { yield* Effect.succeed(1) })`
	},
	{
		expected: 0,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
let alias = state
alias = {value: 2}
alias.value = 3`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state: number[] = []
state.sort()`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
Object.assign(state, {value: 1})`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {value: 0}
Object.defineProperty(state, 'value', {value: 1})`
	},
	{
		expected: 1,
		rule: 'no-raw-tagged-object',
		source: `import {Schema} from 'effect'
Schema.transform(Schema.String, Schema.String, {decode: () => ({_tag: 'Raw'}), encode: value => value})`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
function invalid(value: string) { return Effect.succeed(value).pipe(Effect.map(item => item)) }`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import {Effect, pipe} from 'effect'
function invalid(value: string) { return pipe(Effect.succeed(value), Effect.map(item => item)) }`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import * as Fx from 'effect'
function invalid(value: string) { return Fx.Effect.succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-atom-family-inferred-arg',
		source: `import * as R from 'effect/unstable/reactivity'
R.Atom.family(value => value)`
	},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import * as E from 'effect'
const decode = E.Schema.decodeSync(E.Schema.String)`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
export const User = Schema.String.annotate({identifier: 'User'})`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import * as E from 'effect'
const Fx = E.Effect
function invalid(value: string) { return Fx.succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-redundant-effect-wrapper',
		source: `import * as E from 'effect'
const Fx = E.Effect
Fx.fn('invalid')(function* () { return 1 })`
	},
	{
		expected: 1,
		rule: 'no-atom-family-inferred-arg',
		source: `import * as R from 'effect/unstable/reactivity'
const Atom = R.Atom
Atom.family(value => value)`
	},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import * as E from 'effect'
const S = E.Schema
const decode = S.decodeSync(S.String)`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import * as E from 'effect'
const S = E.Schema
export const User = S.String`
	},
	{
		expected: 1,
		rule: 'no-raw-tagged-object',
		source: `import {Schema} from 'effect'
Schema.Struct({value: Schema.transform(Schema.String, Schema.String, {decode: () => ({_tag: 'Raw'}), encode: value => value})})`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
useState(() => { consume(new Map()); return 0 })`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import {useRef} from 'react'
useRef(factory(new Map()))`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {nested: {items: [] as string[]}}
state.nested.items.push('x')`
	},
	{
		expected: 1,
		rule: 'no-atom-family-inferred-arg',
		source: `import {Atom} from 'effect/unstable/reactivity'
const family = Atom.family
family(value => value)`
	},
	{
		expected: 1,
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect} from 'effect'
const fn = Effect.fn
fn(function* () { return 1 })`
	},
	{
		expected: 0,
		rule: 'no-raw-tagged-object',
		source: `import {Match} from 'effect'
const when = Match.when
when({_tag: 'A'}, () => 1)`
	},
	{
		expected: 1,
		rule: 'no-schema-decoder-alias',
		source: `import * as E from 'effect'
const {decodeSync} = E.Schema`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema, pipe} from 'effect'
export const User = pipe(Schema.String, Schema.brand('User'))`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import * as E from 'effect'
export const User = E.pipe(E.Schema.String, E.Schema.brand('User'))`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {nested: {items: []}}
const items = state.nested.items
items.push(1)`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
useState(() => { const cache = new Map(); cache.set('key', 'value'); return cache })`
	},
	{
		expected: 0,
		rule: 'no-module-mutable-state',
		source: `const store = {items: [], set() { return 1 }}
store.set()`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect, pipe} from 'effect'
function valid(value: string) { return pipe(Effect.succeed(value), Effect.runPromise) }`
	},
	{
		expected: 0,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema, pipe} from 'effect'
const Value = pipe(Schema.String, Schema.decodeSync)`
	},
	{
		expected: 0,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
const Value = Schema.String.pipe(Schema.decodeSync)`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import * as E from 'effect'
const {Effect: Fx} = E
function invalid(value: string) { return Fx.succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-atom-family-inferred-arg',
		source: `import {Atom} from 'effect/unstable/reactivity'
const {family} = Atom
family(value => value)`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
const {runPromise} = Effect
function valid(value: string) { return Effect.succeed(value).pipe(runPromise) }`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
const {runPromise: run} = Effect
function valid(value: string) { return Effect.succeed(value).pipe(run) }`
	},
	{
		expected: 1,
		rule: 'no-restricted-library-api',
		source: `import {Effect} from 'effect'
const {runPromise} = Effect
runPromise(Effect.void)`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {items: []}
const {items} = state
items.push('value')`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import * as React from 'react'
const {useState: state} = React
state(() => new Map())`
	},
	{
		expected: 1,
		rule: 'no-native-prototype-method',
		source: `const {values} = {values: [1]}
values.map(value => value)`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
const {String: Text} = Schema
export const User = Text`
	},
	{
		expected: 1,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
const {succeed} = Effect
function invalid(value: string) { return succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = [] as string[]
state.push('x')`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = ({value: 0}) satisfies {value: number}
state.value = 1`
	},
	{expected: 1, rule: 'no-private-workspace-import', source: 'void import(`@deslop/git/src/service`)'},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
useState(() => { if (condition) return new Map(); return new Map() })`
	},
	{
		expected: 0,
		rule: 'no-native-mutable-collection',
		source: `import {useRef} from 'react'
useRef(new Map() as Map<string, string>)`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import * as React from 'react'
let {useState: state} = React
state = service
state(() => new Map())`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
function valid(value: unknown) { return Effect.isEffect(value) }`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
let {succeed} = Effect
succeed = service
function valid(value: string) { return succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = ({items: []}) as {items: string[]}
state.items.push('value')`
	},
	{
		expected: 1,
		rule: 'no-fake-ref-state',
		source: `import * as React from 'react'
const {useState: state} = React
state(() => ({current: 0}))`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
const text = Schema.String
export const User = text`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
async function valid(value: string) { return Effect.succeed(value) }
function* alsoValid(value: string) { return Effect.succeed(value) }`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
const cache = new Map()
useState(() => cache)`
	},
	{
		expected: 0,
		rule: 'no-redundant-effect-wrapper',
		source: `import {Effect} from 'effect'
declare function defer(work: () => Effect.Effect<unknown>): void
defer(() => Effect.gen(function* () { yield* Effect.void }))`
	},
	{
		expected: 1,
		rule: 'no-restricted-library-api',
		source: `import {Effect} from 'effect'
const run = Effect.runPromise
run(Effect.void)`
	},
	{
		expected: 1,
		rule: 'no-native-prototype-method',
		source: `const value = 'text'
value.trim()`
	},
	{
		expected: 4,
		rule: 'no-restricted-library-api',
		source: `import {Data, Effect, Schema} from 'effect'
Data.Class('Value')
Schema.Class('Value')({value: Schema.String})
JSON.parse('{}')
JSON.stringify({})
function valid(JSON: {parse: (value: string) => unknown}) { return JSON.parse('{}') }
void Effect.void`
	},
	{
		expected: 0,
		rule: 'no-effect-returning-function',
		source: `import {Effect} from 'effect'
function valid(transform: (value: string) => string) { return Effect.map(transform) }
function alsoValid(callback: () => void) { return Effect.fn(callback) }`
	},
	{
		expected: 0,
		filename: 'fixture.schema.ts',
		rule: 'no-schema-without-type-export',
		source: `import {Schema} from 'effect'
export const IsSchema = Schema.isSchema
const {isSchema} = Schema
export const AlsoIsSchema = isSchema`
	},
	{
		expected: 0,
		rule: 'no-module-mutable-state',
		source: `const state = {items: [], api: {set() {}}}
state.api.set()`
	},
	{
		expected: 1,
		rule: 'no-native-mutable-collection',
		source: `import {useState} from 'react'
declare function factory<T>(value: T): T
useState(() => ({cache: factory(new Map())}))`
	},
	{
		expected: 1,
		filename: 'fixture.schema.ts',
		rule: 'no-restricted-library-api',
		source: `import {Schema} from 'effect'
export const User = Schema.Class('User')({value: Schema.String})`
	},
	{
		expected: 1,
		rule: 'no-module-mutable-state',
		source: `const state = {nested: {items: []}}
const {items} = state.nested
items.push(1)`
	}
] as const

describe('oxlint plugin', () => {
	for (const testCase of cases) {
		it(testCase.rule, () => {
			const diagnostics = lint(testCase.rule, testCase.source, testCase.filename)
			assert.strictEqual(diagnostics.length, 1)
			const diagnostic = diagnostics[0]
			assert.isDefined(diagnostic)
			assert.strictEqual(diagnostic.code, `@deslop/oxlint-rules(${testCase.rule})`)
			assert.strictEqual(diagnostic.message, testCase.message)
			assert.strictEqual(diagnostic.labels[0]?.span.line, testCase.invalidLine)

			const allRulesDiagnostics = lintRules(
				pipe(
					cases,
					Array.map(item => item.rule)
				),
				testCase.source,
				testCase.filename
			)
			assert.strictEqual(allRulesDiagnostics.length, 1)
			assert.strictEqual(allRulesDiagnostics[0]?.code, diagnostic.code)
		})
	}

	for (const testCase of adversarialCases) {
		it(`${testCase.rule} adversarial boundary`, () => {
			const filename = 'filename' in testCase ? testCase.filename : 'fixture.ts'
			const diagnostics = lint(testCase.rule, testCase.source, filename)
			assert.strictEqual(
				diagnostics.length,
				testCase.expected,
				pipe(
					diagnostics,
					Array.map(diagnostic => diagnostic.code),
					Array.join(', ')
				)
			)
		})
	}

	it('reports one root diagnostic with every custom rule enabled', () => {
		const rules = pipe(
			cases,
			Array.map(testCase => testCase.rule)
		)
		const diagnostics = lintRules(rules, `const cache = new Map()\ncache.set('key', 'value')`)
		assert.strictEqual(diagnostics.length, 1)
		assert.strictEqual(diagnostics[0]?.code, '@deslop/oxlint-rules(no-native-mutable-collection)')
	})

	it('covers every configured custom rule', () => {
		const ruleNames = pipe(
			cases,
			Array.map(testCase => testCase.rule)
		)
		assert.strictEqual(ruleNames.length, 16)
		assert.strictEqual(pipe(ruleNames, Array.dedupe).length, ruleNames.length)
		assert.isTrue(pipe(ruleNames, Array.every(String.isNonEmpty)))
	})
})
