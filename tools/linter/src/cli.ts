#!/usr/bin/env node
import {NodeRuntime, NodeServices} from '@effect/platform-node'

import {Array, Effect, ManagedRuntime, pipe} from 'effect'

import {candidatePaths, parseMode} from './candidate.ts'
import {runLint} from './run-lint.ts'

const program = Effect.fnUntraced(function* (cwd: string, arguments_: string[]) {
	const mode = yield* parseMode(arguments_)
	const paths = yield* candidatePaths({cwd, mode})
	if (paths.length === 0) return 0
	const result = yield* runLint({capture: false, cwd, paths})
	return result.exitCode
})

const runtime = ManagedRuntime.make(NodeServices.layer)
NodeRuntime.runMain(
	pipe(
		Effect.promise(() => runtime.runPromise(Effect.scoped(program(process.cwd(), Array.drop(process.argv, 2))))),
		Effect.tap(exitCode =>
			Effect.sync(() => {
				process.exitCode = exitCode
			})
		),
		Effect.ensuring(Effect.promise(() => runtime.dispose()))
	)
)
