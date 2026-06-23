import {Array, Effect, FileSystem, Function, Order, Path, Record, Schema, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {ScriptPackageJson, ScriptRun} from '#rpcs/contracts.ts'

function packageJson(source: string) {
	return Schema.decodeUnknownSync(Schema.fromJsonString(ScriptPackageJson))(source)
}

export const discoverPackageScripts = Effect.fnUntraced(function* (cwd: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const manifest = yield* pipe(
		fs.readFileString(path.join(cwd, 'package.json')),
		Effect.flatMap(source => Effect.try({catch: Function.identity, try: () => packageJson(source)})),
		Effect.match({onFailure: () => {}, onSuccess: Function.identity})
	)

	return pipe(
		manifest?.scripts ?? {},
		Record.toEntries,
		Array.map(([scriptName, command]) => ({command, scriptName, sessionId: scriptName, taskId: scriptName})),
		Array.sortWith(script => script.taskId, Order.String)
	)
})

export function scriptRuns(
	scripts: readonly {
		readonly command: string
		readonly scriptName: string
		readonly sessionId: string
		readonly taskId: string
	}[]
) {
	return Array.map(scripts, script => ScriptRun.make(script))
}

export function packageScriptCommand(
	cwd: string,
	script: {readonly command: string; readonly scriptName: string; readonly sessionId: string; readonly taskId: string}
) {
	return ChildProcess.make('vp', ['run', script.taskId], {cwd})
}
