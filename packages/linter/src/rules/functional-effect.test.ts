import {Array} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string) {
	return Array.map(StrictLinter.analyzeText('sample.ts', sourceText), diagnostic => diagnostic.rule)
}

function typedRulesFor(sourceText: string) {
	return Array.map(StrictLinter.analyzeTypedText('sample.ts', sourceText), diagnostic => diagnostic.rule)
}

describe('functional-effect rules', () => {
	test('no-native-prototype-method', () => {
		expect(rulesFor('const names = users.map(user => user.name)')).toContain('no-native-prototype-method')
	})

	test('no-effect-antipatterns', () => {
		expect(rulesFor('const run = () => Effect.gen(function* () { return yield* Effect.fail(error) })')).toContain(
			'no-effect-antipatterns'
		)
	})

	test('no-pipe-method', () => {
		expect(rulesFor('const value = input.pipe(Effect.map(value => value))')).toContain('no-pipe-method')
	})

	test('no-react-compiler-antipatterns', () => {
		expect(rulesFor('const handler = useCallback(() => save(), [])')).toContain('no-react-compiler-antipatterns')
	})

	test('no-promise-api', () => {
		expect(rulesFor('promise.then(value => save(value))')).toContain('no-promise-api')
		expect(rulesFor('Promise.all(items)')).toContain('no-promise-api')
	})

	test('no-json-api', () => {
		expect(rulesFor('const value = JSON.parse(text)')).toContain('no-json-api')
		expect(rulesFor('const text = JSON.stringify(value)')).toContain('no-json-api')
	})

	test('allows debug JSON stringify', () => {
		expect(rulesFor('const text = JSON.stringify(value, null, 2)')).not.toContain('no-json-api')
	})

	test('no-option-from-conversion', () => {
		expect(rulesFor('const value = Option.fromNullishOr(input)')).toContain('no-option-from-conversion')
		expect(rulesFor('const value = pipe(input, Option.fromUndefinedOr)')).toContain('no-option-from-conversion')
	})

	test('allows Option usage from Effect module results', () => {
		expect(rulesFor('const value = pipe(items, Array.head, Option.getOrThrow)')).not.toContain(
			'no-option-from-conversion'
		)
	})

	test('no-mutation', () => {
		expect(rulesFor('value += 1')).toContain('no-mutation')
	})

	test('no-map-set-mutation', () => {
		expect(rulesFor('const values = new Map<string, string>()')).toContain('no-map-set-mutation')
		expect(typedRulesFor('const values = new Map<string, string>(); values.set("a", "b")')).toContain(
			'no-map-set-mutation'
		)
	})

	test('no-discarded-array-transform', () => {
		expect(rulesFor('pipe(items, Array.map(item => report(item)))')).toContain('no-discarded-array-transform')
		expect(rulesFor('Array.filter(items, item => item.enabled)')).toContain('no-discarded-array-transform')
		expect(rulesFor('const names = pipe(items, Array.map(item => item.name))')).not.toContain(
			'no-discarded-array-transform'
		)
		expect(
			rulesFor('pipe(items, Array.filter(item => item.enabled), Array.forEach(item => report(item)))')
		).not.toContain('no-discarded-array-transform')
	})

	test('no-useless-pipe', () => {
		expect(rulesFor('const names = pipe(files, Array.map(file => file.name))')).toContain('no-useless-pipe')
		expect(rulesFor('const tsx = pipe(filePath, String.endsWith("x"))')).toContain('no-useless-pipe')
		expect(
			rulesFor('const names = pipe(files, Array.filter(file => file.enabled), Array.map(file => file.name))')
		).not.toContain('no-useless-pipe')
	})

	test('no-yield-in-pipe', () => {
		expect(
			rulesFor('const run = Effect.gen(function* () { return yield* Effect.fail(pipe(yield* read, String.trim)) })')
		).toContain('no-yield-in-pipe')
		expect(
			rulesFor('const run = Effect.gen(function* () { return yield* pipe(read, Effect.map(String.trim)) })')
		).not.toContain('no-yield-in-pipe')
	})

	test('no-array-empty-ternary', () => {
		expect(rulesFor('const text = Array.isReadonlyArrayEmpty(diagnostics) ? "" : render(diagnostics)')).toContain(
			'no-array-empty-ternary'
		)
	})

	test('floatingEffect', () => {
		expect(typedRulesFor('import {Effect} from "effect"; Effect.succeed("ok")')).toContain('floatingEffect')
		expect(
			typedRulesFor('import {Effect, pipe} from "effect"; pipe(Effect.succeed("ok"), Effect.map(value => value))')
		).toContain('floatingEffect')
		expect(
			typedRulesFor('import {Effect} from "effect"; const run = Effect.fnUntraced(function* () { return "ok" }); run()')
		).toContain('floatingEffect')
		expect(typedRulesFor('import {Effect} from "effect"; const value = Effect.succeed("ok")')).not.toContain(
			'floatingEffect'
		)
		expect(
			typedRulesFor(
				'import {Effect} from "effect"; const run = Effect.fnUntraced(function* () { yield* Effect.succeed("ok") })'
			)
		).not.toContain('floatingEffect')
		expect(typedRulesFor('import {Effect} from "effect"; Effect.runPromise(Effect.succeed("ok"))')).not.toContain(
			'floatingEffect'
		)
	})
})
