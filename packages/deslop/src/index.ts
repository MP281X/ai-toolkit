#!/usr/bin/env bun

import {BunRuntime, BunServices} from '@effect/platform-bun'
import {Array, Effect, Match, pipe, Runtime, Schema, Terminal} from 'effect'

import {Argument, Command, Flag} from 'effect/unstable/cli'

import {renderText, runDeslop} from '#lib/analyzer.ts'

class LintFailure extends Schema.TaggedErrorClass<LintFailure>()('LintFailure', {}) {
	override readonly [Runtime.errorExitCode] = 1
	override readonly [Runtime.errorReported] = false
}

const runAndRender = Effect.fnUntraced(function* (options: {
	readonly mode: string
	readonly cwd: string
	readonly paths?: readonly string[]
}) {
	const result = yield* runDeslop(options)
	yield* pipe(
		Terminal.Terminal.asEffect(),
		Effect.flatMap(terminal => terminal.display(renderText(result.diagnostics)))
	)
	if (!Array.isReadonlyArrayEmpty(result.diagnostics)) return yield* new LintFailure()
})

BunRuntime.runMain(
	pipe(
		Command.runWith(
			Command.withDescription(
				Command.make(
					'deslop',
					{
						unstaged: Flag.withDescription(Flag.boolean('unstaged'), 'Lint unstaged source files.'),
						changed: Flag.withDescription(Flag.boolean('changed'), 'Lint source files changed from HEAD.'),
						full: Flag.withDescription(Flag.boolean('full'), 'Lint every tracked source file.'),
						paths: Argument.string('path').pipe(
							Argument.withDescription('File or directory to lint.'),
							Argument.variadic({min: 0})
						)
					},
					config => {
						if (
							Array.length([
								...(config.unstaged ? ['unstaged'] : []),
								...(config.changed ? ['changed'] : []),
								...(config.full ? ['full'] : [])
							]) > 1
						) {
							return Effect.fail('Use only one of --unstaged, --changed, or --full.')
						}
						if (!(config.unstaged || config.changed || config.full) && Array.isReadonlyArrayEmpty(config.paths)) {
							return Effect.fail('Pass --changed, --unstaged, --full, or at least one path.')
						}

						return runAndRender({
							cwd: process.cwd(),
							mode: pipe(
								Match.value(config),
								Match.when({unstaged: true}, () => 'unstaged' as const),
								Match.when({changed: true}, () => 'changed' as const),
								Match.when({full: true}, () => 'full' as const),
								Match.orElse(() => {
									return Array.isReadonlyArrayEmpty(config.paths) ? ('changed' as const) : ('paths' as const)
								})
							),
							paths: Array.isReadonlyArrayEmpty(config.paths) ? undefined : [...config.paths]
						})
					}
				),
				'Remove slop from TypeScript and React code.'
			),
			{version: ''}
		)(Array.drop(Bun.argv, 2)),
		Effect.provide(BunServices.layer),
		Effect.catch(error => {
			return Effect.sync(() => {
				if (Runtime.getErrorReported(error)) process.stderr.write(`${error}\n`)
				process.exit(Runtime.getErrorExitCode(error))
			})
		})
	)
)
