#!/usr/bin/env bun

import {BunRuntime, BunServices} from '@effect/platform-bun'

import {Array, Effect, Match, Option, Runtime, Schema, String, Terminal, pipe} from 'effect'

import {Argument, Command, Flag} from 'effect/unstable/cli'

import {renderText, runDeslop} from '#lib/analyzer.ts'
import type {RuleScope} from '#rules/helpers.ts'

class LintFailure extends Schema.TaggedErrorClass<LintFailure>()('LintFailure', {}) {
	public override readonly [Runtime.errorExitCode] = 1
	public override readonly [Runtime.errorReported] = false
}

const runAndRender = Effect.fnUntraced(function* (options: {
	readonly mode: string
	readonly cwd: string
	readonly paths?: readonly string[]
	readonly scopes?: readonly RuleScope[]
}) {
	const result = yield* runDeslop(options)
	yield* Effect.flatMap(Terminal.Terminal, terminal => terminal.display(renderText(result.diagnostics)))
	if (!Array.isReadonlyArrayEmpty(result.diagnostics)) return yield* new LintFailure()
})

BunRuntime.runMain(
	pipe(
		Command.runWith(
			Command.withDescription(
				Command.make(
					'deslop',
					{
						changed: Flag.withDescription(Flag.boolean('changed'), 'Lint source files changed from HEAD.'),
						full: Flag.withDescription(Flag.boolean('full'), 'Lint every tracked source file.'),
						paths: pipe(
							Argument.string('path'),
							Argument.withDescription('File or directory to lint.'),
							Argument.variadic({min: 0})
						),
						scopes: pipe(
							Flag.string('scopes'),
							Flag.withDescription('Comma-separated rule scopes to run: base,react,effect.'),
							Flag.optional
						),
						unstaged: Flag.withDescription(Flag.boolean('unstaged'), 'Lint unstaged source files.')
					},
					config => {
						if ((config.unstaged ? 1 : 0) + (config.changed ? 1 : 0) + (config.full ? 1 : 0) > 1) {
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
								Match.orElse(() =>
									Array.isReadonlyArrayEmpty(config.paths) ? ('changed' as const) : ('paths' as const)
								)
							),
							paths: Array.isReadonlyArrayEmpty(config.paths) ? undefined : Array.fromIterable(config.paths),
							scopes: Option.match(config.scopes, {
								onNone: () => undefined,
								onSome: value =>
									pipe(
										String.split(value, ','),
										Array.map(String.trim),
										Array.filter(String.isNonEmpty),
										Array.map(value => {
											if (value === 'base' || value === 'react' || value === 'effect') return value
											throw new Error(`Invalid --scopes value "${value}". Use base, react, effect.`)
										})
									)
							})
						})
					}
				),
				'Remove slop from TypeScript and React code.'
			),
			{version: ''}
		)(Array.drop(Bun.argv, 2)),
		Effect.provide(BunServices.layer),
		Effect.catchTags({
			LintFailure: error =>
				Effect.sync(() => {
					process.exit(Runtime.getErrorExitCode(error))
				})
		}),
		Effect.catchIf(
			(error): error is string => typeof error === 'string',
			error =>
				Effect.sync(() => {
					process.stderr.write(`${error}\n`)
					process.exit(1)
				})
		)
	)
)
