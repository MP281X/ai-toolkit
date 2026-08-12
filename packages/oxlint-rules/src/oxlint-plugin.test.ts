import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Array, Effect, FileSystem, Path, Schema, Stream, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

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
		stdout: yield* Schema.decodeEffect(Schema.fromJsonString(OxlintOutput))(result.stdout)
	}
})

function customCodes(output: OxlintOutput) {
	return pipe(
		output.diagnostics,
		Array.filter(diagnostic => String.startsWith('@deslop/oxlint-rules(')(diagnostic.code)),
		Array.map(diagnostic => diagnostic.code),
		Array.sort(String.Order)
	)
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
									"import {Schema, SchemaTransformation, pipe} from 'effect'",
									"import {useRef, useState} from 'react'",
									'',
									'declare const input: unknown',
									'declare const source: string',
									'const decode = Schema.decodeUnknownSync(Schema.String)',
									'const MissingType = Schema.Struct({value: Schema.String})',
									'type Explicit = {readonly values: readonly string[]}',
									'const ref = useRef<HTMLElement | null>(null)',
									'const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(source)',
									'function forward(value: string) { return consume(value) }',
									'function ready() { return source.length > 0 }',
									'function run() { consume(source) }',
									'function consume(value: string) { return value.length }',
									'const callbacks = {consume: (value: string) => consume(value)}',
									'const alias = source',
									'const [fake] = useState(() => ({current: null}))',
									'const state = useState(0)',
									'export {MissingType, alias, callbacks, decode, decoded, fake, forward, input, ready, ref, run}',
									'export type {Explicit}'
								],
								Array.join('\n')
							)
						})
						expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(1))
						expect(customCodes(result.stdout)).toEqual(
							pipe(
								[
									'@deslop/oxlint-rules(inline-schema-operation)',
									'@deslop/oxlint-rules(no-fake-ref-state)',
									'@deslop/oxlint-rules(no-readonly-type-syntax)',
									'@deslop/oxlint-rules(no-readonly-type-syntax)',
									'@deslop/oxlint-rules(no-redundant-use-ref-null-type)',
									'@deslop/oxlint-rules(no-trivial-indirection)',
									'@deslop/oxlint-rules(no-trivial-indirection)',
									'@deslop/oxlint-rules(no-trivial-indirection)',
									'@deslop/oxlint-rules(no-trivial-indirection)',
									'@deslop/oxlint-rules(no-trivial-indirection)',
									'@deslop/oxlint-rules(no-undestructured-use-state)',
									'@deslop/oxlint-rules(no-unvalidated-json-decode)',
									'@deslop/oxlint-rules(schema-type-pair)'
								],
								Array.sort(String.Order)
							)
						)
						expect(result.stderr).toBe('')
					}),
					Effect.scoped
				),
			20_000
		)

		testApi.effect(
			'allows maintained-tool counterparts and semantic ownership',
			() =>
				pipe(
					Effect.gen(function* () {
						const result = yield* lintSource({
							name: 'valid.tsx',
							source: pipe(
								[
									"import {useAtomSet} from '@effect/atom-react'",
									"import {Schema, SchemaTransformation, identity, pipe} from 'effect'",
									"import {useRef, useState} from 'react'",
									"import {RpcClient} from '#lib/atomRuntime.ts'",
									'',
									'declare const input: unknown',
									'declare const actionAtom: object',
									'declare function combine(left: string, right: string): string',
									'type User = typeof User.Type',
									'const User = Schema.Struct({name: Schema.String})',
									'export type Public = typeof Public.Type',
									'const Public = Schema.Struct({name: Schema.String})',
									'type Exported = typeof Exported.Type',
									'export const Exported = Schema.Struct({name: Schema.String})',
									'type Normalized = typeof Normalized.Type',
									'const Normalized = pipe(Schema.Struct({value: Schema.String}), Schema.decodeTo(Schema.Struct({value: Schema.String}), SchemaTransformation.transform({decode: identity, encode: identity})))',
									'const decoded = Schema.decodeUnknown(User)(input)',
									'const encoded = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(input)',
									'const ref = useRef<HTMLElement>(null)',
									'const mutate = useAtomSet(actionAtom, {mode: "promise"})',
									'const fire = useAtomSet(RpcClient.mutation("save"))',
									'const [stable] = useState(() => actionAtom)',
									'function transform(value: string) { return value.length }',
									'function swap(left: string, right: string) { return combine(right, left) }',
									'function first(head: string, tail: string) { return head }',
									'function withDefault(value = "ready") { return transform(value) }',
									'const tuple = ["ready", 1] as const',
									'export {Normalized, decoded, encoded, fire, first, mutate, ref, stable, swap, transform, tuple, withDefault}'
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
						expect(customCodes(result.stdout)).toEqual(['@deslop/oxlint-rules(no-duplicate-root-dependency)'])
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
