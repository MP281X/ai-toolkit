import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Array, Effect, FileSystem, Path, Schema, String, pipe} from 'effect'

import {ChildProcessSpawner} from 'effect/unstable/process'

import {runLint} from './run-lint.ts'

type OxlintOutput = typeof OxlintOutput.Type
const OxlintOutput = Schema.Struct({
	diagnostics: Schema.Array(Schema.Struct({code: Schema.String, message: Schema.String}))
})

const lintSource = Effect.fnUntraced(function* (input: {name: string; source: string}) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const directory = yield* fs.makeTempDirectoryScoped({directory: import.meta.dirname, prefix: 'fixture-'})
	const file = path.join(directory, input.name)
	yield* fs.writeFileString(file, String.replace(/^((?:import[^\n]*\n)+)(?!\n)/u, '$1\n')(input.source))

	const result = yield* runLint({
		arguments: ['--format=json'],
		capture: true,
		cwd: path.resolve(import.meta.dirname, '../../..'),
		paths: [file]
	})
	return {
		exitCode: result.exitCode,
		stderr: result.stderr,
		stdout: yield* Schema.decodeEffect(Schema.fromJsonString(OxlintOutput))(result.stdout)
	}
})

function customCodes(output: OxlintOutput) {
	return pipe(
		customDiagnostics(output),
		Array.map(diagnostic => String.replace(/^deslop[/(]([^)]*)\)?$/u, 'deslop($1)')(diagnostic.code)),
		Array.sort(String.Order)
	)
}

function customDiagnostics(output: OxlintOutput) {
	return Array.filter(output.diagnostics, diagnostic => String.startsWith('deslop')(diagnostic.code))
}

describe('deslop Oxlint plugin', {concurrent: false}, () => {
	it.layer(NodeServices.layer)(testApi => {
		testApi.effect(
			'reports every project-specific invalid state',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'invalid.tsx',
							source: pipe(
								[
									"import {Schema, SchemaGetter, SchemaTransformation, identity, pipe} from 'effect'",
									"import * as React from 'react'",
									"import {useRef, useState} from 'react'",
									'',
									'declare const input: unknown',
									'declare const source: string',
									'const decode = Schema.decodeUnknownSync(Schema.String)',
									'const operations = {decode: Schema.decodeUnknownSync(Schema.String)}',
									'class Codecs { decode = Schema.decodeUnknownSync(Schema.String) }',
									'const decoders = [Schema.decodeUnknownSync(Schema.String)]',
									'const IsString = Schema.is(Schema.String)',
									'const AssertString = Schema.asserts(Schema.String)',
									'let assigned = decode',
									'assigned = Schema.decodeUnknownSync(Schema.String)',
									'const MissingType = Schema.Struct({value: Schema.String})',
									'const MissingFluent = Schema.String.annotate({description: "value"})',
									'const MissingTransform = Schema.decodeTo(Schema.Number, SchemaTransformation.transform({decode: Number, encode: String}))(Schema.String)',
									'const MissingDecode = Schema.decode({decode: SchemaGetter.transform(identity), encode: SchemaGetter.transform(identity)})(Schema.String)',
									'const MissingEncode = Schema.encode({decode: SchemaGetter.transform(identity), encode: SchemaGetter.transform(identity)})(Schema.String)',
									'type Explicit = {readonly values: readonly string[]}',
									'type Mapped<T> = {readonly [K in keyof T]: T[K]}',
									'type Index = {readonly [key: string]: string}',
									'class Input { readonly field = "value"; constructor(readonly value: string) {} }',
									'const ref = useRef<HTMLElement | null>(null)',
									'const namespaceRef = React.useRef<HTMLElement | null>(null)',
									'const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(source)',
									'const directDecoded = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(source)',
									'function forward(value: string) { return consume(value) }',
									'function ready() { return source.length > 0 }',
									'function run() { consume(source) }',
									'function consume(value: string) { return value.length }',
									'const callbacks = {consume: (value: string) => consume(value)}',
									'const alias = source',
									'const [fake] = useState(() => ({current: null}))',
									'const state = useState(0)',
									'const [fakeNamespace] = React.useState(() => ({current: null}))',
									'const stateNamespace = React.useState(0)',
									'export {AssertString, Codecs, Input, IsString, MissingDecode, MissingEncode, MissingFluent, MissingTransform, MissingType, alias, assigned, callbacks, decode, decoded, decoders, directDecoded, fake, fakeNamespace, forward, input, namespaceRef, operations, ready, ref, run, stateNamespace}',
									'export type {Explicit, Index, Mapped}'
								],
								Array.join('\n')
							)
						})
						expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(1))
						expect(customCodes(result.stdout)).toEqual(
							pipe(
								[
									'deslop(no-fake-ref-state)',
									'deslop(no-fake-ref-state)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-readonly-type-syntax)',
									'deslop(no-redundant-use-ref-null-type)',
									'deslop(no-redundant-use-ref-null-type)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-stored-schema-operation)',
									'deslop(no-trivial-indirection)',
									'deslop(no-trivial-indirection)',
									'deslop(no-trivial-indirection)',
									'deslop(no-trivial-indirection)',
									'deslop(no-trivial-indirection)',
									'deslop(no-undestructured-use-state)',
									'deslop(no-undestructured-use-state)',
									'deslop(no-unvalidated-json-decode)',
									'deslop(no-unvalidated-json-decode)',
									'deslop(schema-type-pair)',
									'deslop(schema-type-pair)',
									'deslop(schema-type-pair)',
									'deslop(schema-type-pair)',
									'deslop(schema-type-pair)'
								],
								Array.sort(String.Order)
							)
						)
						expect(
							pipe(
								customDiagnostics(result.stdout),
								Array.filter(diagnostic => diagnostic.code === 'deslop(no-stored-schema-operation)'),
								Array.map(diagnostic => diagnostic.message)
							)
						).toEqual(
							Array.makeBy(
								7,
								() => 'Inline this Schema operation at its consumption site; never store compiled operations.'
							)
						)
						expect(result.stderr).toBe('')
					}),
					Effect.scoped
				),
			20_000
		)

		testApi.effect(
			'allows valid schemas and semantic owners',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'valid.tsx',
							source: pipe(
								[
									"import {Array, Schema, SchemaGetter, SchemaTransformation, identity, pipe} from 'effect'",
									'',
									'declare const input: unknown',
									'declare function combine(left: string, right: string): string',
									'type User = typeof User.Type',
									'const User = Schema.Struct({name: Schema.String})',
									'type Annotated = typeof Annotated.Type',
									'const Annotated = Schema.String.annotate({description: "value"})',
									'export type Public = typeof Public.Type',
									'const Public = Schema.Struct({name: Schema.String})',
									'type Exported = typeof Exported.Type',
									'export const Exported = Schema.Struct({name: Schema.String})',
									'type Normalized = typeof Normalized.Type',
									'const Normalized = pipe(Schema.Struct({value: Schema.String}), Schema.decodeTo(Schema.Struct({value: Schema.String}), SchemaTransformation.transform({decode: identity, encode: identity})))',
									'type Decoded = typeof Decoded.Type',
									'const Decoded = Schema.decode({decode: SchemaGetter.transform(identity), encode: SchemaGetter.transform(identity)})(Schema.String)',
									'type Encoded = typeof Encoded.Type',
									'const Encoded = Schema.encode({decode: SchemaGetter.transform(identity), encode: SchemaGetter.transform(identity)})(Schema.String)',
									'const decoded = Schema.decodeUnknownEffect(User)(input)',
									'const encoded = Schema.encodeUnknownSync(Schema.fromJsonString(User))(input)',
									'const decodedMany = Array.map([input], value => Schema.decodeUnknownSync(User)(value))',
									'const isUser = Schema.is(User)(input)',
									'Schema.asserts(User, input)',
									'const Formatter = Schema.toFormatter(User)',
									'const Arbitrary = Schema.toArbitrary(User)',
									'function transform(value: string) { return value.length }',
									'function swap(left: string, right: string) { return combine(right, left) }',
									'function withDefault(value = "ready") { return transform(value) }',
									'const tuple = ["ready", 1] as const',
									'export {Annotated, Arbitrary, Decoded, Encoded, Formatter, Normalized, decoded, decodedMany, encoded, isUser, swap, transform, tuple, withDefault}'
								],
								Array.join('\n')
							)
						})
						expect(customCodes(result.stdout)).toEqual([])
						expect(result.stderr).toBe('')
						expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(0))
					}),
					Effect.scoped
				),
			20_000
		)

		testApi.effect(
			'rejects workspace dependencies already owned by the root',
			() =>
				pipe(
					Effect.gen(function* () {
						const fs = yield* FileSystem.FileSystem
						const path = yield* Path.Path
						const workspace = yield* fs.makeTempDirectoryScoped({
							directory: path.resolve(import.meta.dirname, '../..'),
							prefix: 'duplicate-dependency-'
						})
						yield* fs.writeFileString(
							path.join(workspace, 'package.json'),
							'{"dependencies":{"effect":"latest"},"name":"@deslop/duplicate"}'
						)
						const result = yield* lintSource({name: 'vite.config.ts', source: 'export default {}'})
						expect(customCodes(result.stdout)).toEqual(['deslop(no-duplicate-root-dependency)'])
					}),
					Effect.scoped
				),
			20_000
		)

		testApi.effect(
			'uses import bindings instead of matching shadowed names',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'bindings.ts',
							source: pipe(
								[
									'function compile(Schema: {decode: (value: string) => string}) {',
									'  return Schema.decode("ok")',
									'}',
									'function useRef<T>() { return undefined as T | undefined }',
									'const ref = useRef<string | null>()',
									'export {compile, ref}'
								],
								Array.join('\n')
							)
						})
						expect(customCodes(result.stdout)).toEqual([])
					}),
					Effect.scoped
				),
			20_000
		)
	})
})
