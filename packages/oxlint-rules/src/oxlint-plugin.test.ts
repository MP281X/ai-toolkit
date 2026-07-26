import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Effect, FileSystem, Path, Schema, Stream, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

type OxlintOutput = typeof OxlintOutput.Type
const OxlintOutput = Schema.Struct({
	diagnostics: Schema.Array(
		Schema.Struct({
			code: Schema.String,
			labels: Schema.Array(
				Schema.Struct({span: Schema.Struct({column: Schema.Finite, length: Schema.Finite, line: Schema.Finite})})
			),
			message: Schema.String
		})
	)
})

const lintSource = Effect.fnUntraced(function* (input: {readonly name: string; readonly source: string}) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const directory = yield* fs.makeTempDirectoryScoped({directory: import.meta.dirname, prefix: 'fixture-'})
	const file = path.join(directory, input.name)
	yield* fs.writeFileString(file, input.source)

	const handle = yield* ChildProcess.make('vp', ['lint', file, '--format=json'], {
		cwd: path.resolve(import.meta.dirname, '../../..'),
		stderr: 'pipe',
		stdout: 'pipe'
	})
	const result = yield* Effect.all(
		{
			exitCode: handle.exitCode,
			stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
			stdout: Stream.mkString(Stream.decodeText(handle.stdout))
		},
		{concurrency: 'unbounded'}
	)
	return {
		exitCode: result.exitCode,
		stderr: result.stderr,
		stdout: yield* Schema.decodeUnknownEffect(Schema.fromJsonString(OxlintOutput))(result.stdout)
	}
})

function diagnosticCodes(output: OxlintOutput) {
	return output.diagnostics.map(diagnostic => diagnostic.code).sort()
}

describe('deslop Oxlint plugin', () => {
	it.layer(NodeServices.layer)(testApi => {
		testApi.effect('reports bound schema compilers at their exact location', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'schema-alias.ts',
						source: [
							"import {Schema} from 'effect'",
							'',
							'const decode = Schema.decodeUnknownEffect(Schema.String)',
							'void decode'
						].join('\n')
					})
					expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(1))
					expect(result.stdout.diagnostics[0]?.code).toBe('@deslop/oxlint-rules(inline-schema-operation)')
					expect(result.stdout.diagnostics[0]?.labels[0]?.span.column).toBe(16)
					expect(result.stdout.diagnostics[0]?.labels[0]?.span.line).toBe(3)
					expect(result.stderr).toBe('')
				}),
				Effect.scoped
			)
		)

		testApi.effect(
			'allows inline schema operations and rejects flow laundering',
			() =>
				pipe(
					Effect.gen(function* () {
						const allowed = yield* lintSource({
							name: 'schema-inline.ts',
							source: [
								"import {Effect, Schema} from 'effect'",
								'declare const input: unknown',
								'const decoded = Schema.decodeUnknownEffect(Schema.String)(input)',
								'const piped = Effect.flatMap(Effect.succeed(input), Schema.decodeUnknownEffect(Schema.String))',
								'void {decoded, piped}'
							].join('\n')
						})
						const rejected = yield* lintSource({
							name: 'schema-flow.ts',
							source: [
								"import {flow, Schema} from 'effect'",
								'const decode = flow(Schema.decodeUnknownEffect(Schema.String))',
								'void decode'
							].join('\n')
						})
						expect(allowed.stdout.diagnostics).toEqual([])
						expect(allowed.exitCode).toBe(ChildProcessSpawner.ExitCode(0))
						expect(diagnosticCodes(rejected.stdout)).toEqual(['@deslop/oxlint-rules(inline-schema-operation)'])
					}),
					Effect.scoped
				),
			15_000
		)

		testApi.effect(
			'uses bindings so shadowed Effect and Schema lookalikes are allowed',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'binding-collisions.ts',
							source: [
								'function compile(input: {readonly Schema: {readonly decode: (value: string) => string}}) {',
								'\treturn input.Schema.decode("ok")',
								'}',
								'const Effect = {fn: (value: string) => value.length + 1}',
								'void Effect',
								'void compile'
							].join('\n')
						})
						expect(result.stdout.diagnostics).toEqual([])
						expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(0))
					}),
					Effect.scoped
				),
			10_000
		)

		testApi.effect('allows concise ternaries and rejects multiline value initializers', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'ternary-initializers.ts',
						source: [
							'declare const condition: boolean',
							'const concise = condition ? "yes" : "no"',
							'const multiline = condition',
							'\t? "yes"',
							'\t: "no"',
							'void {concise, multiline}'
						].join('\n')
					})
					expect(diagnosticCodes(result.stdout)).toEqual(['@deslop/oxlint-rules(no-multiline-ternary-initializer)'])
				}),
				Effect.scoped
			)
		)

		testApi.effect('reports method-style pipe without requiring a pipe import', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'method-pipe-no-import.ts',
						source: [
							'declare const value: {readonly pipe: (transform: (input: string) => number) => number}',
							'void value.pipe(input => input.length)'
						].join('\n')
					})
					expect(diagnosticCodes(result.stdout)).toEqual(['@deslop/oxlint-rules(no-method-pipe)'])
				}),
				Effect.scoped
			)
		)

		testApi.effect(
			'rejects import aliases and allows schema primitive definitions',
			() =>
				pipe(
					Effect.gen(function* () {
						const rejected = yield* lintSource({
							name: 'import-binding.ts',
							source: ["import {Schema as S} from 'effect'", 'void S.String'].join('\n')
						})
						const allowed = yield* lintSource({
							name: 'schema-primitive.ts',
							source: [
								"import {Schema} from 'effect'",
								'type UserId = typeof UserId.Type',
								'const UserId = Schema.String',
								'void UserId'
							].join('\n')
						})
						expect(diagnosticCodes(rejected.stdout)).toEqual(['@deslop/oxlint-rules(no-access-alias)'])
						expect(allowed.stdout.diagnostics).toEqual([])
					}),
					Effect.scoped
				),
			15_000
		)

		testApi.effect(
			'allows managed tag patterns and schema tags but rejects raw tag handling',
			() =>
				pipe(
					Effect.gen(function* () {
						const allowed = yield* lintSource({
							name: 'tag-pattern.ts',
							source: [
								"import {Match, Schema} from 'effect'",
								'type Tagged = typeof Tagged.Type',
								"const Tagged = Schema.Struct({_tag: Schema.Literal('Ready')})",
								"const match = Match.when({_tag: 'Ready'}, () => true)",
								'void Tagged',
								'void match'
							].join('\n')
						})
						const rejected = yield* lintSource({
							name: 'tag-manual.ts',
							source: ["const value = {_tag: 'Ready'}", 'void value._tag'].join('\n')
						})
						expect(allowed.stdout.diagnostics).toEqual([])
						expect(diagnosticCodes(rejected.stdout)).toEqual([
							'@deslop/oxlint-rules(no-manual-tag)',
							'@deslop/oxlint-rules(no-manual-tag)'
						])
					}),
					Effect.scoped
				),
			15_000
		)

		testApi.effect('enforces every custom invariant without cross-rule laundering', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'all-invariants.ts',
						source: [
							"import {Context, Data, Effect, Schema} from 'effect'",
							"import '@deslop/components/src/private.ts'",
							"import {useState} from 'react'",
							'declare const input: unknown',
							'declare const record: {readonly value: string}',
							'declare const tagged: {readonly _tag: string}',
							"class Service extends Context.Service<Service>()('Service', {make: Effect.succeed({})}) {}",
							'const decoder = Schema.decodeUnknownEffect(Schema.String)',
							'function localDefinition(fieldValue: unknown) {',
							'\tconst Local = Schema.Struct({value: Schema.Unknown})',
							'\treturn {Local, value: fieldValue}',
							'}',
							'const value = record.value',
							'export const IdentityKey = `identity:${value}`',
							'class Legacy extends Data.Class<{readonly value: string}> {}',
							'void Effect.runPromise(Effect.void)',
							'void Effect.void.pipe(Effect.ignore)',
							'function Component() {',
							'\tconst [fakeRef] = useState(() => ({current: 0}))',
							'\treturn fakeRef',
							'}',
							'void tagged._tag',
							'const mutable = new Map<string, string>()',
							'const nullary = Effect.fn(function* () { return 1 })',
							'function forwarded(text: string) { return text }',
							'void Schema.Class<{readonly value: string}>("Legacy")({value: Schema.String})',
							'const MissingPair = Schema.Struct({value: Schema.String})',
							'Service.of({capability: Effect.succeed(1)})',
							'void Component',
							'void decoder',
							'void forwarded',
							'void input',
							'void Legacy',
							'void localDefinition',
							'void MissingPair',
							'void mutable',
							'void nullary'
						].join('\n')
					})
					expect(diagnosticCodes(result.stdout)).toEqual(
						[
							'@deslop/oxlint-rules(inline-schema-operation)',
							'@deslop/oxlint-rules(module-scope-definition)',
							'@deslop/oxlint-rules(no-access-alias)',
							'@deslop/oxlint-rules(no-composed-identity-key)',
							'@deslop/oxlint-rules(no-data-class)',
							'@deslop/oxlint-rules(no-effect-run-entrypoint)',
							'@deslop/oxlint-rules(no-fake-ref-state)',
							'@deslop/oxlint-rules(no-manual-tag)',
							'@deslop/oxlint-rules(no-method-pipe)',
							'@deslop/oxlint-rules(no-native-mutable-collection)',
							'@deslop/oxlint-rules(no-nullary-effect-fn)',
							'@deslop/oxlint-rules(no-pass-through-wrapper)',
							'@deslop/oxlint-rules(no-private-workspace-import)',
							'@deslop/oxlint-rules(no-schema-class)',
							'@deslop/oxlint-rules(schema-type-pair)',
							'@deslop/oxlint-rules(service-capability-tracing)'
						].sort()
					)
				}),
				Effect.scoped
			)
		)

		testApi.effect('allows every Effect-managed counterpart and contextual callback', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'all-counterparts.ts',
						source: [
							"import {Data, Effect, Match, Schema} from 'effect'",
							'declare const raw: unknown',
							'type User = typeof User.Type',
							'const User = Schema.Struct({value: Schema.String})',
							'const decoded = Schema.decodeUnknownEffect(User)(raw)',
							'const tags = Data.taggedEnum<{Ready: {readonly value: string}}>()',
							"const pattern = Match.when({_tag: 'Ready'}, () => true)",
							"const capability = Effect.fn('Service.capability')(function* (text: string) { return text.length + 1 })",
							'function computed(value: {readonly value: number}) { return value.value + 1 }',
							'const values = ["a"].map((value, index) => `${value}${index}`)',
							'void computed',
							'void decoded',
							'void pattern',
							'void tags',
							'void values'
						].join('\n')
					})
					expect(result.stdout.diagnostics).toEqual([])
					expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(0))
				}),
				Effect.scoped
			)
		)

		testApi.effect(
			'resolves service bindings and accepts data-first Effect and Stream spans',
			() =>
				pipe(
					Effect.gen(function* () {
						const rejected = yield* lintSource({
							name: 'service-untraced.ts',
							source: [
								"import {Context, Effect} from 'effect'",
								"class Service extends Context.Service<Service>()('Service', {make: Effect.succeed({})}) {}",
								'Service.of({load: Effect.succeed(1)})'
							].join('\n')
						})
						const allowed = yield* lintSource({
							name: 'service-traced.ts',
							source: [
								"import {Context, Effect, Stream} from 'effect'",
								"class Service extends Context.Service<Service>()('Service', {make: Effect.succeed({})}) {}",
								"Service.of({events: Stream.withSpan(Stream.empty, 'Service.events'), load: Effect.withSpan(Effect.succeed(1), 'Service.load')})"
							].join('\n')
						})
						expect(diagnosticCodes(rejected.stdout)).toEqual(['@deslop/oxlint-rules(service-capability-tracing)'])
						expect(allowed.stdout.diagnostics).toEqual([])
					}),
					Effect.scoped
				),
			15_000
		)

		testApi.effect(
			'recognizes piped Schema, Layer, Schedule, and Config definitions',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'piped-definitions.ts',
							source: [
								"import {Config, Layer, pipe, Schedule, Schema} from 'effect'",
								'const MissingPair = pipe(Schema.String, Schema.check(Schema.isMinLength(1)))',
								'function definitions() {',
								'\tconst localConfig = pipe(Config.string("KEY"), value => value)',
								'\tconst localLayer = pipe(Layer.empty, value => value)',
								"\tconst localSchedule = pipe(Schedule.spaced('1 second'), value => value)",
								'\treturn {localConfig, localLayer, localSchedule}',
								'}',
								'void {MissingPair, definitions}'
							].join('\n')
						})
						expect(diagnosticCodes(result.stdout)).toEqual([
							'@deslop/oxlint-rules(module-scope-definition)',
							'@deslop/oxlint-rules(module-scope-definition)',
							'@deslop/oxlint-rules(module-scope-definition)',
							'@deslop/oxlint-rules(schema-type-pair)'
						])
					}),
					Effect.scoped
				),
			15_000
		)

		testApi.effect('covers object operations and Effect.fn forwarding wrappers', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'authored-operations.ts',
						source: [
							"import {Effect} from 'effect'",
							'declare const repository: {readonly load: (value: string) => Effect.Effect<string>}',
							"const load = Effect.fn('load')(function* (value: string) { return yield* repository.load(value) })",
							'void load'
						].join('\n')
					})
					expect(diagnosticCodes(result.stdout)).toEqual(['@deslop/oxlint-rules(no-pass-through-wrapper)'])
				}),
				Effect.scoped
			)
		)

		testApi.effect('rejects fnUntraced nullaries, identity laundering, and duplicate TaggedStruct tags', () =>
			pipe(
				Effect.gen(function* () {
					const result = yield* lintSource({
						name: 'focused-exceptions.ts',
						source: [
							"import {Effect, identity, Schema} from 'effect'",
							'const decode = identity(Schema.decodeUnknownEffect(Schema.String))',
							'const nullary = Effect.fnUntraced(function* () { return 1 })',
							"void Schema.TaggedStruct('Ready', {_tag: Schema.String})",
							'void {decode, nullary}'
						].join('\n')
					})
					expect(diagnosticCodes(result.stdout)).toEqual([
						'@deslop/oxlint-rules(inline-schema-operation)',
						'@deslop/oxlint-rules(no-manual-tag)',
						'@deslop/oxlint-rules(no-nullary-effect-fn)'
					])
				}),
				Effect.scoped
			)
		)
	})
})
