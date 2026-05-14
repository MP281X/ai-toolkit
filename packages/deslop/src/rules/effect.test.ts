import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('prefer-effect-fn-untraced reports parameterized functions returning Effect', () => {
	expectRule({
		rule: 'prefer-effect-fn-untraced',
		source: 'import {Effect} from "effect"\nfunction loadUser(id: string) { return Effect.succeed(id) }\n',
		typed: true
	})
})

test('prefer-effect-gen-program reports no-argument functions returning Effect', () => {
	expectRule({
		rule: 'prefer-effect-gen-program',
		source: 'import {Effect} from "effect"\nfunction program() { return Effect.succeed("ready") }\n',
		typed: true
	})
})

test('no-floating-effect reports unused Effect expressions', () => {
	expectRule({
		rule: 'no-floating-effect',
		source: 'import {Effect} from "effect"\nEffect.log("saved")\n',
		typed: true
	})
})

test('prefer-top-level-rcmap reports RcMap constructors inside programs', () => {
	expectRule({
		rule: 'prefer-top-level-rcmap',
		source:
			'import {Effect, RcMap} from "effect"\nconst program = Effect.gen(function* () { return yield* RcMap.make({ lookup: () => Effect.succeed("user") }) })\n',
		typed: true
	})
})

test('prefer-top-level-rcmap allows PascalCase top-level RcMap values', () => {
	expectNoRule({
		rule: 'prefer-top-level-rcmap',
		source:
			'import {Effect, RcMap} from "effect"\nconst Users = RcMap.make({ lookup: () => Effect.succeed("user") })\nconst program = Effect.gen(function* () { return yield* Users })\n',
		typed: true
	})
})

test('no-standard-prototype-methods reports standard method calls', () => {
	expectRule({
		rule: 'no-standard-prototype-methods',
		source: 'const name = " Ada ".trim()\n',
		typed: true
	})
})

test('no-standard-prototype-methods reports Object module calls', () => {
	expectRule({
		rule: 'no-standard-prototype-methods',
		source: 'const keys = Object.keys({ name: "Ada" })\n',
		typed: true
	})
})

test('prefer-effect-random reports crypto UUID calls', () => {
	expectRule({
		rule: 'prefer-effect-random',
		source: 'import {randomUUID} from "node:crypto"\nconst id = randomUUID()\n',
		typed: true
	})
})

test('no-single-operation-pipe reports pipe with one operation', () => {
	expectRule({
		rule: 'no-single-operation-pipe',
		source:
			'import {Array, pipe} from "effect"\ndeclare const names: readonly string[]\nconst trimmed = pipe(names, Array.map(name => name.trim()))\n',
		typed: true
	})
})

test('no-effect-without-semantics reports literal Effect wrappers', () => {
	expectRule({
		rule: 'no-effect-without-semantics',
		source: 'import {Effect} from "effect"\nconst program = Effect.succeed("ready")\n'
	})
})

test('no-effect-without-semantics reports Effect.sync callbacks returning Effect', () => {
	expectRule({
		rule: 'no-effect-without-semantics',
		source: 'import {Effect} from "effect"\nconst program = Effect.sync(() => Effect.succeed("ready"))\n',
		typed: true
	})
})

test('no-effect-without-semantics allows Effect.sync callbacks returning plain values', () => {
	expectNoRule({
		rule: 'no-effect-without-semantics',
		source: 'import {Effect} from "effect"\nconst program = Effect.sync(() => "ready")\n',
		typed: true
	})
})

test('no-effect-without-semantics reports Effect.gen wrappers that only map one yield', () => {
	expectRule({
		rule: 'no-effect-without-semantics',
		source:
			'import {Config, Effect, Option} from "effect"\nconst program = Effect.gen(function* () { return Option.match(yield* Config.option(Config.string("URL")), { onNone: () => "", onSome: value => value }) })\n',
		typed: true
	})
})

test('prefer-effect-catch-tag reports broad catches for tagged errors', () => {
	expectRule({
		rule: 'prefer-effect-catch-tag',
		source:
			'import {Effect, pipe} from "effect"\nclass NotFound { readonly _tag = "NotFound" }\nconst program = pipe(Effect.fail(new NotFound()), Effect.catch(() => Effect.succeed("fallback")))\n',
		typed: true
	})
})

test('no-untyped-effect-error reports unknown error channels', () => {
	expectRule({
		rule: 'no-untyped-effect-error',
		source:
			'import {Effect} from "effect"\ndeclare const program: Effect.Effect<string, unknown>\nconst value = program\n',
		typed: true
	})
})

test('no-option-constructor reports Option.from conversions', () => {
	expectRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst value = Option.fromNullable(input)\n'
	})
})

test('no-option-constructor allows explicit Some and None values', () => {
	expectNoRule({
		rule: 'no-option-constructor',
		source: 'import {Option} from "effect"\nconst one = Option.some("Ada")\nconst two = Option.none()\n'
	})
})

test('prefer-effect-try reports await inside Effect generators', () => {
	expectRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { const response = await fetch("/"); return response })\n'
	})
})

test('prefer-effect-try allows await inside nested async callbacks', () => {
	expectNoRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return Effect.promise(async () => await fetch("/")) })\n'
	})
})

test('prefer-yield-property-access reports yielded property access', () => {
	expectRule({
		rule: 'prefer-yield-property-access',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return (yield* loadUser()).name })\n'
	})
})

test('prefer-effect-try allows awaits inside Effect.tryPromise callbacks', () => {
	expectNoRule({
		rule: 'prefer-effect-try',
		source:
			'import {Effect} from "effect"\nconst program = Effect.tryPromise({ try: async () => await fetch("/"), catch: error => error })\n'
	})
})

test('prefer-schema-tagged-error reports Data.TaggedError classes', () => {
	expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Data} from "effect"\nclass UserError extends Data.TaggedError("UserError")<{ readonly message: string }> {}\n'
	})
})

test('prefer-schema-tagged-error reports yield of Effect.fail', () => {
	expectRule({
		rule: 'prefer-schema-tagged-error',
		source:
			'import {Effect} from "effect"\nconst program = Effect.gen(function* () { return yield* Effect.fail(new UserError()) })\n'
	})
})
