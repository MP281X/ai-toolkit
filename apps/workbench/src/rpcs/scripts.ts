import {Array, Effect, FileSystem, Option, Order, Path, Schema, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {ScriptRun} from '#rpcs/contracts.ts'

type PackageJson = {readonly scripts: Readonly<Record<string, string>>}

export type PackageScript = {
	readonly command: string
	readonly scriptName: string
	readonly sessionId: string
	readonly taskId: string
}

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown)
const ScriptRecord = Schema.Record(Schema.String, Schema.String)

function emptyJsonRecord(): Readonly<Record<string, unknown>> {
	return {}
}

function emptyScriptRecord(): Readonly<Record<string, string>> {
	return {}
}

function packageJson(source: string): PackageJson {
	const value = JSON.parse(source) as unknown
	const record: Readonly<Record<string, unknown>> = pipe(
		value,
		Schema.decodeUnknownOption(JsonRecord),
		Option.getOrElse(emptyJsonRecord)
	)
	const scripts = pipe(record['scripts'], Schema.decodeUnknownOption(ScriptRecord), Option.getOrElse(emptyScriptRecord))

	return {scripts}
}

export const discoverPackageScripts = Effect.fnUntraced(function* (cwd: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const manifest = yield* pipe(
		fs.readFileString(path.join(cwd, 'package.json')),
		Effect.flatMap(source => Effect.try({catch: error => error, try: () => packageJson(source)})),
		Effect.map(Option.some),
		Effect.catch(() => Effect.succeed(Option.none<PackageJson>()))
	)

	return Option.match(manifest, {
		onNone: () => [],
		onSome: value =>
			pipe(
				Object.entries(value.scripts).map(([scriptName, command]) => ({
					command,
					scriptName,
					sessionId: scriptName,
					taskId: scriptName
				})),
				Array.sortWith(script => script.taskId, Order.String)
			)
	})
})

export function scriptRuns(scripts: readonly PackageScript[]) {
	return scripts.map(script => ScriptRun.make(script))
}

export function packageScriptCommand(cwd: string, script: PackageScript) {
	return ChildProcess.make('vp', ['run', script.taskId], {cwd})
}
