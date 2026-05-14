import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('prefer-effect-fn-untraced reports parameterized functions returning Effect', () => {
	return expectRule({
		rule: 'prefer-effect-fn-untraced',
		typed: true,
		source: 'import {Effect} from "effect"\nfunction loadUser(id: string) { return Effect.succeed(id) }\n'
	})
})

test('prefer-effect-gen-program reports no-argument functions returning Effect', () => {
	return expectRule({
		rule: 'prefer-effect-gen-program',
		typed: true,
		source: 'import {Effect} from "effect"\nfunction program() { return Effect.succeed("ready") }\n'
	})
})

test('no-floating-effect reports unused Effect expressions', () => {
	return expectRule({
		rule: 'no-floating-effect',
		typed: true,
		source: 'import {Effect} from "effect"\nEffect.log("saved")\n'
	})
})

test('prefer-top-level-rcmap reports RcMap constructors inside programs', () => {
	return expectRule({
		rule: 'prefer-top-level-rcmap',
		typed: true,
		source:
			'import {Effect, RcMap} from "effect"\nconst program = Effect.gen(function* () { return yield* RcMap.make({ lookup: () => Effect.succeed("user") }) })\n'
	})
})

test('prefer-top-level-rcmap allows PascalCase top-level RcMap values', () => {
	return expectNoRule({
		rule: 'prefer-top-level-rcmap',
		typed: true,
		source:
			'import {Effect, RcMap} from "effect"\nconst Users = RcMap.make({ lookup: () => Effect.succeed("user") })\nconst program = Effect.gen(function* () { return yield* Users })\n'
	})
})

test('no-standard-prototype-methods reports standard method calls', () => {
	return expectRule({
		rule: 'no-standard-prototype-methods',
		typed: true,
		source: 'const name = " Ada ".trim()\n'
	})
})

test('no-standard-prototype-methods reports Object module calls', () => {
	return expectRule({
		rule: 'no-standard-prototype-methods',
		typed: true,
		source: 'const keys = Object.keys({ name: "Ada" })\n'
	})
})

test('prefer-effect-random reports crypto UUID calls', () => {
	return expectRule({
		rule: 'prefer-effect-random',
		typed: true,
		source: 'import {randomUUID} from "node:crypto"\nconst id = randomUUID()\n'
	})
})

test('no-single-operation-pipe reports pipe with one operation', () => {
	return expectRule({
		rule: 'no-single-operation-pipe',
		typed: true,
		source:
			'import {Array, pipe} from "effect"\ndeclare const names: readonly string[]\nconst trimmed = pipe(names, Array.map(name => name.trim()))\n'
	})
})

test('no-effect-without-semantics reports literal Effect wrappers', () => {
	return expectRule({
		rule: 'no-effect-without-semantics',
		source: 'import {Effect} from "effect"\nconst program = Effect.succeed("ready")\n'
	})
})

test('no-effect-without-semantics reports Effect.sync callbacks returning Effect', () => {
	return expectRule({
		rule: 'no-effect-without-semantics',
		typed: true,
		source: 'import {Effect} from "effect"\nconst program = Effect.sync(() => Effect.succeed("ready"))\n'
	})
})

test('no-effect-without-semantics allows Effect.sync callbacks returning plain values', () => {
	return expectNoRule({
		rule: 'no-effect-without-semantics',
		typed: true,
		source: 'import {Effect} from "effect"\nconst program = Effect.sync(() => "ready")\n'
	})
})

test('no-effect-without-semantics reports Effect.gen wrappers that only map one yield', () => {
	return expectRule({
		rule: 'no-effect-without-semantics',
		typed: true,
		source:
			'import {Config, Effect, Option} from "effect"\nconst program = Effect.gen(function* () { return Option.match(yield* Config.option(Config.string("URL")), { onNone: () => "", onSome: value => value }) })\n'
	})
})

test('prefer-effect-catch-tag reports broad catches for tagged errors', () => {
	return expectRule({
		rule: 'prefer-effect-catch-tag',
		typed: true,
		source:
			'import {Effect, pipe} from "effect"\nclass NotFound { readonly _tag = "NotFound" }\nconst program = pipe(Effect.fail(new NotFound()), Effect.catch(() => Effect.succeed("fallback")))\n'
	})
})

test('no-untyped-effect-error reports unknown error channels', () => {
	return expectRule({
		rule: 'no-untyped-effect-error',
		typed: true,
		source:
			'import {Effect} from "effect"\ndeclare const program: Effect.Effect<string, unknown>\nconst value = program\n'
	})
})

test('no-option-constructor reports Option.from conversions', () => {
	return expectRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst value = Option.fromNullable(input)\n'
	})
})

test('no-option-constructor allows explicit Some and None values', () => {
	return expectNoRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst one = Option.some("Ada")\nconst two = Option.none()\n'
	})
})

test('prefer-effect-try reports await inside Effect generators', () => {
	return expectRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { const response = await fetch("/"); return response })\n'
	})
})

test('prefer-effect-try allows await inside nested async callbacks', () => {
	return expectNoRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return Effect.promise(async () => await fetch("/")) })\n'
	})
})

test('prefer-yield-property-access reports yielded property access', () => {
	return expectRule({
		rule: 'prefer-yield-property-access',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return (yield* loadUser()).name })\n'
	})
})

test('prefer-effect-try allows awaits inside Effect.tryPromise callbacks', () => {
	return expectNoRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.tryPromise({ try: async () => await fetch("/"), catch: error => error })\n'
	})
})

test('prefer-schema-tagged-error reports Data.TaggedError classes', () => {
	return expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Data} from "effect"\nclass UserError extends Data.TaggedError("UserError")<{ readonly message: string }> {}\n'
	})
})

test('prefer-schema-tagged-error reports yield of Effect.fail', () => {
	return expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return yield* Effect.fail(new UserError()) })\n'
	})
})
