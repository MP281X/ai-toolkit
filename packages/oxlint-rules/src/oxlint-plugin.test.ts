import {Effect, Schema} from 'effect'

// oxlint-disable-next-line @deslop/oxlint-rules/no-private-workspace-import -- fixture
import {GitWorkspace} from '../../git/src/service.ts'
// oxlint-disable-next-line @deslop/oxlint-rules/no-private-test-import -- fixture
import oxlintPlugin from '../src/oxlint-plugin.ts'

const source = {prefix: 'fixture', value: 'value'} as const

// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias -- fixture
const accessAlias = source.value

function compare(dynamicValue: string) {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-condition-alias -- fixture
	const conditionAlias = dynamicValue === 'value'
	return conditionAlias
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-object-destructure -- fixture
const {value: destructuredValue} = source

// oxlint-disable-next-line @deslop/oxlint-rules/no-pass-through-wrapper -- fixture
function passThrough(value: string) {
	return value
}

// oxlint-disable-next-line @deslop/oxlint-rules/no-nullary-effect-fn -- fixture
const nullaryEffect = Effect.fn('Fixture.nullary')(function* () {
	return 'ok'
})

// oxlint-disable-next-line @deslop/oxlint-rules/no-floating-local-type -- fixture
type Local = string

const localValue: Local = 'local'

// oxlint-disable-next-line @deslop/oxlint-rules/no-composed-identity-key, @deslop/oxlint-rules/no-condition-alias -- fixture
export const composedIdentity = source.prefix + source.value

// oxlint-disable-next-line @deslop/oxlint-rules/no-public-raw-domain-string, @deslop/oxlint-rules/no-access-alias -- fixture
export const RawName = Schema.String

// oxlint-disable-next-line @deslop/oxlint-rules/no-single-use-guard -- fixture
function isFixture(value: string) {
	return value.length > 0
}

export const fixture = {
	GitWorkspace,
	accessAlias,
	compare,
	destructuredValue,
	isFixture,
	localValue,
	nullaryEffect,
	oxlintPlugin,
	passThrough
}
