// oxlint-disable-next-line @deslop/oxlint-rules/no-import-alias -- fixture
import {Effect, Option, Record as EffectRecord, Schema, String} from 'effect'
import type {FixtureRegister} from 'effect'

import {Atom} from 'effect/unstable/reactivity'
import {describe} from 'vite-plus/test'

// oxlint-disable-next-line @deslop/oxlint-rules/no-private-workspace-import -- fixture
import {GitWorkspace} from '../../git/src/service.ts'
// oxlint-disable-next-line @deslop/oxlint-rules/no-private-test-import -- fixture
import oxlintPlugin from '../src/oxlint-plugin.ts'

describe.skip('oxlint plugin fixture', () => {})

declare function useState<Value>(
	initial: Value | (() => Value)
): readonly [Value, (update: (current: Value) => Value) => void]

const source = {prefix: 'fixture', value: 'value'} as const

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias, @deslop/oxlint-rules/no-schema-without-type-export -- fixture
const FixtureSchemaWithoutType = Schema.String

type FixtureSchemaWithType = typeof FixtureSchemaWithType.Type
// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias -- fixture
const FixtureSchemaWithType = Schema.String

// oxlint-disable-next-line @deslop/oxlint-rules/no-schema-class -- fixture
class FixtureSchemaClass extends Schema.Class<FixtureSchemaClass>('FixtureSchemaClass')({value: Schema.String}) {}

// oxlint-disable-next-line @deslop/oxlint-rules/no-schema-class -- fixture
class FixtureSchemaTaggedClass extends Schema.TaggedClass<FixtureSchemaTaggedClass>()('FixtureSchemaTaggedClass', {
	value: Schema.String
}) {}

class FixtureSchemaTaggedErrorClass extends Schema.TaggedErrorClass<FixtureSchemaTaggedErrorClass>()(
	'FixtureSchemaTaggedErrorClass',
	{value: Schema.String}
) {}
void FixtureSchemaClass
void FixtureSchemaTaggedClass
void FixtureSchemaTaggedErrorClass

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias, @deslop/oxlint-rules/no-schema-without-type-export -- fixture
const FixtureSchemaTypeAfterValue = Schema.String
type FixtureSchemaTypeAfterValue = typeof FixtureSchemaTypeAfterValue.Type
declare function acceptsFixtureSchemaTypeAfterValue(value: FixtureSchemaTypeAfterValue): void
void FixtureSchemaTypeAfterValue

// oxlint-disable-next-line @deslop/oxlint-rules/no-variable-type-annotation -- fixture
const values: readonly (string | null)[] = [source.value]

// oxlint-disable-next-line @deslop/oxlint-rules/no-let -- fixture
let mutableValue = 'mutable'
mutableValue = 'changed'

const emptyRecord = EffectRecord.empty<string>()

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias -- fixture
const accessAlias = source.value

function compare(dynamicValue: string) {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-condition-alias -- fixture
	const conditionAlias = dynamicValue === 'value'
	return conditionAlias
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-condition-alias, @deslop/oxlint-rules/no-nullish-comparison -- fixture
const hasValue = values[0] !== null

// oxlint-disable-next-line @deslop/oxlint-rules/no-condition-alias, @deslop/oxlint-rules/no-nullish-comparison -- fixture
const stringValue = typeof source.value === 'string'

// oxlint-disable-next-line @deslop/oxlint-rules/no-object-destructure -- fixture
const {value: destructuredValue} = source

// oxlint-disable-next-line @deslop/oxlint-rules/no-pass-through-wrapper, @deslop/oxlint-rules/no-single-use-helper -- fixture
function passThrough(value: string) {
	return value
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-nullary-effect-fn -- fixture
const nullaryEffect = Effect.fn('Fixture.nullary')(function* () {
	return 'ok'
})

// oxlint-disable-next-line @deslop/oxlint-rules/no-nullary-effect-wrapper -- fixture
function nullaryEffectWrapper() {
	return Effect.gen(function* () {
		return 'ok'
	})
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-zero-arg-effect-fn -- fixture
const zeroArgEffectFn = Effect.fn(function* () {
	return 'ok'
})

// oxlint-disable-next-line @deslop/oxlint-rules/no-nullary-effect-fn, @deslop/oxlint-rules/no-useless-effect-wrapper -- fixture
const uselessEffectWrapper = Effect.fn('Fixture.useless')(function* () {
	yield* Effect.succeed('ok')
})

// oxlint-disable-next-line @deslop/oxlint-rules/no-floating-local-type -- fixture
type Local = string

// oxlint-disable-next-line @deslop/oxlint-rules/no-primitive-const, @deslop/oxlint-rules/no-variable-type-annotation -- fixture
const localValue: Local = 'local'

// oxlint-disable-next-line @deslop/oxlint-rules/no-primitive-const -- fixture
const fixtureSessionPattern = /fixture/u
void fixtureSessionPattern

type SharedLocal = {value: string}

// oxlint-disable-next-line @deslop/oxlint-rules/no-variable-type-annotation -- fixture
const sharedLocalOne: SharedLocal = {value: 'one'}
// oxlint-disable-next-line @deslop/oxlint-rules/no-variable-type-annotation -- fixture
const sharedLocalTwo: SharedLocal = {value: 'two'}

type ReusedLocal = {readonly value: string}

// oxlint-disable-next-line @deslop/oxlint-rules/no-single-use-helper -- fixture
function reusedLocalOne(value: ReusedLocal) {
	return `${value.value} one`
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-single-use-helper -- fixture
function reusedLocalTwo(value: ReusedLocal) {
	return `${value.value} two`
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-function-return-type, @deslop/oxlint-rules/no-single-use-helper, @deslop/oxlint-rules/no-static-return-function -- fixture
function explicitReturn(): string {
	return 'explicit'
}

function recursiveReturn(value: number): number {
	if (value <= 1) return 1
	return value * recursiveReturn(value - 1)
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-returning-function -- fixture
function effectReturningFunction(value: string) {
	return Effect.succeed(value)
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-pass-through-wrapper -- fixture
function acceptsCallback(callback: (...args: unknown[]) => unknown) {
	return callback
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-pass-through-wrapper, @deslop/oxlint-rules/no-single-use-helper -- fixture
function acceptsStringCallback(callback: (value: string) => unknown) {
	return callback
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-identity-callback, @deslop/oxlint-rules/no-native-prototype-method, @deslop/oxlint-rules/no-pass-through-wrapper, @deslop/oxlint-rules/no-typed-callback-params -- fixture
const typedCallback = [1].map((value: number) => value)

const typedGeneratorCallback = acceptsCallback(function* (resume: unknown) {
	yield resume
})

const untypedGeneratorCallback = acceptsCallback(function* (resume) {
	yield resume
})

const standaloneEffectFunction = Effect.fn('Fixture.standalone')(function* (value: string) {
	return value
})

const contextOwnedEffectFunction = acceptsStringCallback(
	// oxlint-disable-next-line @deslop/oxlint-rules/no-typed-callback-params -- fixture
	Effect.fn('Fixture.context')(function* (value: string) {
		return value
	})
)

// oxlint-disable-next-line @deslop/oxlint-rules/no-floating-local-type, @deslop/oxlint-rules/no-optional-undefined-property -- fixture
type OptionalUndefined = {value?: string | undefined}

// oxlint-disable-next-line @deslop/oxlint-rules/no-variable-type-annotation -- fixture
const optionalUndefined: OptionalUndefined = {}

// oxlint-disable-next-line @deslop/oxlint-rules/no-identity-callback, @deslop/oxlint-rules/no-native-prototype-method, @deslop/oxlint-rules/no-pass-through-wrapper -- fixture
const identityCallback = [source.value].map(value => value)

// oxlint-disable-next-line @deslop/oxlint-rules/no-native-prototype-method -- fixture
const joinedValues = [source.value].join(',')

// oxlint-disable-next-line @deslop/oxlint-rules/no-option-constructor -- fixture
const constructedOption = Option.some(source.value)

// oxlint-disable-next-line @deslop/oxlint-rules/no-native-mutable-collection -- fixture
const nativeMutableCollection = new Map<string, string>()

function FakeRefStateFixture() {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-fake-ref-state, @deslop/oxlint-rules/no-native-mutable-collection -- fixture
	const fakeRefState = useState(() => ({current: new Map<string, string>()}))
	return fakeRefState
}

function StatePatchFixture() {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-floating-local-type -- fixture
	type PatchState = {readonly value: string}
	const state = useState({value: 'initial'})

	// oxlint-disable-next-line @deslop/oxlint-rules/no-generic-state-patch -- fixture
	function patchState(patch: Partial<PatchState>) {
		if (String.isEmpty(state[0].value)) return
		state[1](current => ({...current, ...patch}))
	}

	patchState({value: 'next'})
	return state[0]
}

function mutableHolder(value: string) {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-local-mutable-holder -- fixture
	const holder = {value}
	holder.value = 'next'
	return holder.value
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-static-return-function -- fixture
function staticReturn() {
	return {value: 'static'}
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-identity-callback, @deslop/oxlint-rules/no-pass-through-wrapper, @deslop/oxlint-rules/no-promise-callback -- fixture
const promiseCallback = Promise.resolve(source.value).then(value => value)

// oxlint-disable-next-line @deslop/oxlint-rules/no-single-use-guard -- fixture
function isFixture(value: string) {
	return value.length > 0
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-helper, @deslop/oxlint-rules/no-single-use-helper -- fixture
function nulField(value: {field: string}) {
	return value.field
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-single-use-helper -- fixture
export function exportedSessionHelper(value: string) {
	return Number(value)
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-helper -- fixture
function accessField(value: {readonly field?: string}) {
	return value.field ?? ''
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-atom-family-inferred-arg -- fixture
const familyAtom = Atom.family(value => Atom.make(value))

declare module 'effect' {
	/** @expected-unused -- module augmentation fixture */
	// oxlint-disable-next-line @deslop/oxlint-rules/no-declare-module-export -- fixture
	export type FixtureRegister = {readonly value: string}
}

const fixtureRegister = {value: 'fixture'} satisfies FixtureRegister

// oxlint-disable-next-line @deslop/oxlint-rules/no-iife -- fixture
const iifeValue = (() => source.value)()

// oxlint-disable-next-line @deslop/oxlint-rules/no-module-mutable-state -- fixture
const mutableModuleState = {current: 0}
mutableModuleState.current = 1

// oxlint-disable-next-line @deslop/oxlint-rules/no-raw-tagged-object -- fixture
const rawTagged = {_tag: 'fixture'}

function matchable(value: 'one' | 'two' | 'three') {
	// oxlint-disable-next-line @deslop/oxlint-rules/prefer-match -- fixture
	if (value === 'one') return 1
	if (value === 'two') return 2
	return 3
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-pass-through-wrapper -- fixture
function trivialHandler() {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- fixture
	Effect.runSync(Effect.void)
}

void {
	FakeRefStateFixture,
	FixtureSchemaWithType,
	FixtureSchemaWithoutType,
	GitWorkspace,
	StatePatchFixture,
	accessAlias,
	accessField,
	compare,
	constructedOption,
	contextOwnedEffectFunction,
	destructuredValue,
	effectReturningFunction,
	emptyRecord,
	explicitReturn,
	familyAtom,
	fixtureRegister,
	hasValue,
	identityCallback,
	iifeValue,
	isFixture,
	joinedValues,
	localValue,
	matchable,
	mutableHolder,
	mutableModuleState,
	mutableValue,
	nativeMutableCollection,
	nulField,
	nullaryEffect,
	nullaryEffectWrapper,
	optionalUndefined,
	oxlintPlugin,
	passThrough,
	promiseCallback,
	rawTagged,
	recursiveReturn,
	reusedLocalOne,
	reusedLocalTwo,
	sharedLocalOne,
	sharedLocalTwo,
	standaloneEffectFunction,
	staticReturn,
	stringValue,
	trivialHandler,
	typedCallback,
	typedGeneratorCallback,
	untypedGeneratorCallback,
	uselessEffectWrapper,
	zeroArgEffectFn
}
