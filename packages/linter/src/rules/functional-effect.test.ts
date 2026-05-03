import {Array, pipe} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string) {
	return pipe(
		StrictLinter.analyzeText('sample.ts', sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
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

	test('no-then', () => {
		expect(rulesFor('promise.then(value => save(value))')).toContain('no-then')
	})

	test('no-mutation', () => {
		expect(rulesFor('value += 1')).toContain('no-mutation')
	})
})
