import {
	Array,
	Context,
	Data,
	Duration,
	Effect,
	FileSystem,
	HashMap,
	Layer,
	Option,
	Path,
	Predicate,
	RcMap,
	Record,
	Result,
	Schema,
	Stream,
	SubscriptionRef,
	pipe
} from 'effect'

import {ProcessError, ProcessSnapshot} from './schema.ts'

import {ManagedProcess} from '@deslop/process/service'

const PackageJson = Schema.Struct({
	name: Schema.optional(Schema.String),
	scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))
})

class ProcessKey extends Data.Class<{readonly cwd: string; readonly script: string}> {}

export class Processes extends Context.Service<Processes>()('@deslop/workbench/services/processes/service/Processes', {
	make: Effect.fnUntraced(function* () {
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const processes = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: (key: ProcessKey) => ManagedProcess.make({command: ['vp', 'run', key.script], cwd: key.cwd})
		})

		const scripts = Effect.fn('Processes.scripts')(function* (cwd: string) {
			const workspaceDirectories = yield* Effect.forEach(
				['apps', 'packages'],
				directory =>
					pipe(
						fs.readDirectory(path.join(cwd, directory)),
						Effect.map(entries => entries.map(entry => path.join(cwd, directory, entry))),
						Effect.orElseSucceed(() => [])
					),
				{concurrency: 2}
			)
			const manifests = yield* Effect.forEach(
				[cwd, ...Array.flatten(workspaceDirectories)],
				directory =>
					pipe(
						fs.readFileString(path.join(directory, 'package.json')),
						Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PackageJson))),
						Effect.map(manifest => ({directory, manifest})),
						Effect.option
					),
				{concurrency: 8}
			)
			return pipe(
				manifests,
				Array.getSomes,
				Array.flatMap(({directory, manifest}) =>
					Record.keys(manifest.scripts ?? {}).map(script =>
						directory === cwd || Predicate.isUndefined(manifest.name) ? script : `${manifest.name}#${script}`
					)
				),
				Array.dedupe
			)
		})
		function get(cwd: string, script: string) {
			return pipe(
				RcMap.get(processes, new ProcessKey({cwd, script})),
				Effect.mapError(cause => ProcessError.make({cause, message: `failed to prepare ${script}`}))
			)
		}
		const snapshot = Effect.fnUntraced(function* (script: string, process: ManagedProcess['Service']) {
			return ProcessSnapshot.make({
				logs: yield* SubscriptionRef.get(process.logs),
				port: process.port,
				script,
				status: yield* SubscriptionRef.get(process.status)
			})
		})
		const observeAll = Effect.fnUntraced(function* (cwd: string) {
			return yield* Effect.forEach(
				yield* scripts(cwd),
				Effect.fnUntraced(function* (script) {
					return {process: yield* get(cwd, script), script}
				}),
				{concurrency: 8}
			)
		})

		return {
			list: Effect.fn('Processes.list')(function* (cwd: string) {
				const active = HashMap.fromIterable(
					pipe(
						yield* RcMap.keys(processes),
						Array.filter(key => key.cwd === cwd),
						Array.map(key => [key.script, key] as const)
					)
				)
				return yield* Effect.forEach(
					yield* scripts(cwd),
					Effect.fnUntraced(function* (script) {
						const key = Option.getOrUndefined(HashMap.get(active, script))
						if (key === undefined) {
							return ProcessSnapshot.make({logs: [], script, status: 'stopped'})
						}
						const process = yield* Effect.scoped(RcMap.get(processes, key))
						return yield* snapshot(script, process)
					}),
					{concurrency: 8}
				)
			}),
			observe: get,
			start: Effect.fn('Processes.start')(function* (input: {readonly cwd: string; readonly script: string}) {
				if (!(yield* scripts(input.cwd)).includes(input.script)) {
					return yield* ProcessError.make({message: `unknown package script ${input.script}`})
				}
				const process = yield* get(input.cwd, input.script)
				yield* pipe(
					process.start,
					Effect.mapError(cause => ProcessError.make({cause, message: `failed to start ${input.script}`}))
				)
				return yield* snapshot(input.script, process)
			}),
			stop: Effect.fn('Processes.stop')(function* (input: {readonly cwd: string; readonly script: string}) {
				const key = pipe(
					yield* RcMap.keys(processes),
					Array.findFirst(current => current.cwd === input.cwd && current.script === input.script)
				)
				if (Option.isNone(key)) return
				const process = yield* Effect.scoped(RcMap.get(processes, key.value))
				yield* pipe(
					process.stop,
					Effect.mapError(cause => ProcessError.make({cause, message: `failed to stop ${input.script}`}))
				)
				yield* RcMap.invalidate(processes, key.value)
			}),
			stopAll: Effect.fn('Processes.stopAll')(function* (cwd: string) {
				const results = yield* Effect.forEach(
					pipe(
						yield* RcMap.keys(processes),
						Array.filter(key => key.cwd === cwd)
					),
					key =>
						pipe(
							Effect.scoped(RcMap.get(processes, key)),
							Effect.flatMap(process => process.stop),
							Effect.andThen(RcMap.invalidate(processes, key)),
							Effect.mapError(cause => ProcessError.make({cause, message: `failed to stop ${key.script}`})),
							Effect.result
						),
					{concurrency: 'unbounded'}
				)
				const failure = Array.findFirst(results, Result.isFailure)
				if (Option.isSome(failure)) return yield* failure.value.failure
			}),
			stream: (cwd: string) =>
				Stream.unwrap(
					pipe(
						observeAll(cwd),
						Effect.map(owned =>
							pipe(
								owned,
								Array.flatMap(({process}) => [
									pipe(
										SubscriptionRef.changes(process.logs),
										Stream.map(() => {})
									),
									pipe(
										SubscriptionRef.changes(process.status),
										Stream.map(() => {})
									)
								]),
								streams => Stream.mergeAll(streams, {concurrency: 'unbounded'}),
								Stream.mapEffect(() =>
									Effect.forEach(owned, ({process, script}) => snapshot(script, process), {concurrency: 8})
								)
							)
						)
					)
				)
		}
	})
}) {
	public static layer = Layer.effect(this, this.make())
}
