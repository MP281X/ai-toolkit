import {Array} from 'effect'

import {expect, test} from 'bun:test'
import {analyzeTypedText} from '#lib/analyzer.ts'
import {expectRule} from './test-utils.ts'

test('prefer-effect-fn-untraced', () => {
	return expectRule({
		rule: 'prefer-effect-fn-untraced',
		typed: true,
		source: 'import {Effect} from "effect"\nfunction save(id: string) { return Effect.succeed(id) }\n'
	})
})
test('prefer-effect-gen-program', () => {
	return expectRule({
		rule: 'prefer-effect-gen-program',
		typed: true,
		source: 'import {Effect} from "effect"\nfunction program() { return Effect.succeed(1) }\n'
	})
})
test('no-floating-effect', () => {
	return expectRule({
		rule: 'no-floating-effect',
		typed: true,
		source: 'import {Effect} from "effect"\nEffect.succeed(1)\n'
	})
})
test('prefer-top-level-pipe-for-effect-values', () => {
	return expectRule({
		rule: 'prefer-top-level-pipe-for-effect-values',
		typed: true,
		source: 'import {Effect} from "effect"\nEffect.asVoid(Effect.succeed(1))\n'
	})
})
test('prefer-top-level-rcmap', () => {
	return expectRule({
		rule: 'prefer-top-level-rcmap',
		typed: true,
		source:
			'import {Effect, RcMap} from "effect"\nconst program = Effect.gen(function* () { if (true) { const resources = yield* RcMap.make({ lookup: () => Effect.void }); return resources } })\n'
	})
})
test('prefer-top-level-rcmap reports root effect generator rcmap constructors', () => {
	return expectRule({
		rule: 'prefer-top-level-rcmap',
		typed: true,
		source:
			'import {Effect, RcMap} from "effect"\nexport const program = Effect.gen(function* () { const resources = yield* RcMap.make({ lookup: () => Effect.void }); return resources })\n'
	})
})
test('prefer-top-level-rcmap allows top-level RcMap values', () => {
	const rules = Array.map(
		analyzeTypedText(
			'sample.ts',
			'import {Effect, RcMap} from "effect"\nconst Resources = RcMap.make({ lookup: () => Effect.void })\nexport const program = Effect.gen(function* () { return yield* Resources })\n'
		),
		diagnostic => diagnostic.rule
	)
	expect(rules).not.toContain('prefer-top-level-rcmap')
	expect(rules).not.toContain('no-access-alias')
})
test('prefer-top-level-rcmap reports lowercase top-level RcMap constructors', () => {
	return expectRule({
		rule: 'prefer-top-level-rcmap',
		typed: true,
		source: 'import {Effect, RcMap} from "effect"\nconst resources = RcMap.make({ lookup: () => Effect.void })\n'
	})
})
test('prefer-effect-module-over-standard-library', () => {
	return expectRule({
		rule: 'prefer-effect-module-over-standard-library',
		typed: true,
		source: 'const value = " name ".trim()\n'
	})
})
test('prefer-direct-call-for-single-data-operation', () => {
	return expectRule({
		rule: 'prefer-direct-call-for-single-data-operation',
		typed: true,
		source:
			'import {Array, pipe} from "effect"\ndeclare const values: ReadonlyArray<string>\nconst result = pipe(values, Array.map(value => value))\n'
	})
})
test('prefer-effect-nullish-predicates', () => {
	return expectRule({
		rule: 'prefer-effect-nullish-predicates',
		source:
			'import {Array} from "effect"\ndeclare const values: ReadonlyArray<string | undefined>\nconst result = Array.filter(values, value => value !== undefined)\n'
	})
})
test('no-effect-async-constructor-mismatch', () => {
	return expectRule({
		rule: 'no-effect-async-constructor-mismatch',
		source: 'import {Effect} from "effect"\nconst program = Effect.sync(async () => { await fetch("/") })\n'
	})
})
test('no-effect-without-semantics', () => {
	return expectRule({
		rule: 'no-effect-without-semantics',
		source: 'import {Effect} from "effect"\nconst program = Effect.succeed("ok")\n'
	})
})
test('no-effect-run-away-from-boundary', () => {
	return expectRule({
		rule: 'no-effect-run-away-from-boundary',
		source: 'import {Effect} from "effect"\nEffect.runFork(Effect.succeed(1))\n',
		filePath: 'src/feature.ts'
	})
})
test('no-option-constructor from conversion', () => {
	return expectRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst value = Option.fromNullable(input)\n'
	})
})
test('no-option-constructor some', () => {
	return expectRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst value = Option.some("value")\n'
	})
})
test('no-option-constructor none', () => {
	return expectRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst value = Option.none()\n'
	})
})
test('prefer-schema-tagged-error over Data.TaggedError', () => {
	return expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Data} from "effect"\nclass LintFailure extends Data.TaggedError("LintFailure")<Record<never, never>> {}\n'
	})
})
test('prefer yieldable tagged error over Effect.fail', () => {
	return expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return yield* Effect.fail(new LintFailure()) })\n'
	})
})
