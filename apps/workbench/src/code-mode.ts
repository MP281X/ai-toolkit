import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'

import type {Layer} from 'effect'
import {Context, Effect, Exit, Predicate, Record, Schema, String, pipe} from 'effect'

import type {CodeModeContext} from './code-mode-contract.ts'

class CodeModeError extends Schema.TaggedErrorClass<CodeModeError>()('CodeModeError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

const forbiddenSource = /\b(?:import|export|runPromise|runSync|runFork)\b|context\s*\[/u

function validateSource(source: string): Effect.Effect<string, CodeModeError> {
	const trimmed = String.trim(source)
	if (!forbiddenSource.test(trimmed) && String.startsWith('effect.Effect.gen(')(trimmed)) return Effect.succeed(trimmed)
	return Effect.fail(
		CodeModeError.make({
			message:
				'code-mode requires one final effect.Effect.gen value without imports, exports, context lookup, or runners'
		})
	)
}

const WorkerCall = Schema.Struct({
	id: Schema.Finite,
	input: Schema.Unknown,
	method: Schema.String,
	type: Schema.Literal('call')
})
const WorkerResult = Schema.Struct({type: Schema.Literal('result'), value: Schema.Unknown})
const WorkerFailure = Schema.Struct({message: Schema.String, type: Schema.Literal('failure')})
const jsonNull = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))('null')

function workerError(cause: unknown, message: string) {
	return CodeModeError.make({cause, message})
}

function isDynamicEffect(value: unknown): value is Effect.Effect<unknown, unknown, unknown> {
	return Effect.isEffect(value)
}

function isHandler(value: unknown): value is (input: unknown) => unknown {
	return typeof value === 'function'
}

export const evaluateCodeMode = Effect.fn('CodeMode.evaluate')(function* <E, R>(input: {
	readonly client: Readonly<Record<string, unknown>>
	readonly context: CodeModeContext
	readonly deadlineMilliseconds?: number
	readonly layer: Layer.Layer<R, E>
	readonly source: string
}) {
	const source = yield* validateSource(input.source)
	const value = yield* Effect.callback<unknown, CodeModeError>(resume => {
		const workerFile = String.endsWith('.ts')(import.meta.url) ? './code-mode-worker.ts' : './code-mode-worker.js'
		const workerUrl = new URL(workerFile, import.meta.url)
		const workerDirectory = path.dirname(fileURLToPath(workerUrl))
		const sourceWorker = String.endsWith('.ts')(workerUrl.pathname)
		const readable = sourceWorker
			? [
					workerDirectory,
					path.resolve(workerDirectory, '../../../node_modules'),
					path.resolve(workerDirectory, '../../../packages/agent/src/schema.ts'),
					path.resolve(workerDirectory, '../../../packages/git/src/schema.ts')
				]
			: [workerDirectory]
		const worker = new Worker(workerUrl, {
			env: {},
			execArgv: ['--permission', `--allow-fs-read=${readable.join(',')}`],
			workerData: {context: input.context, methods: Record.keys(input.client), source}
		})
		let settled = false
		const calls = new Map<number, AbortController>()
		function cancelCalls() {
			const controllers = [...calls.values()]
			calls.clear()
			// Abort outside the callback scheduler to avoid re-entering the Effect runtime that owns this cleanup.
			setTimeout(() => {
				for (const controller of controllers) controller.abort()
			}, 0)
		}
		const deadlineMilliseconds = input.deadlineMilliseconds ?? 30_000
		// @effect-diagnostics-next-line globalTimersInEffect:off
		const deadline = setTimeout(() => {
			if (settled) return
			settled = true
			cancelCalls()
			void worker.terminate()
			resume(Effect.fail(CodeModeError.make({message: 'code-mode exceeded its execution deadline'})))
		}, deadlineMilliseconds)
		function finish(effect: Effect.Effect<unknown, CodeModeError>) {
			if (settled) return
			settled = true
			cancelCalls()
			clearTimeout(deadline)
			void worker.terminate()
			resume(effect)
		}
		worker.on('message', (message: unknown) => {
			const call = Schema.decodeUnknownOption(WorkerCall)(message)
			if (call._tag === 'Some') {
				const handler = input.client[call.value.method]
				if (!isHandler(handler)) {
					worker.postMessage({
						error: `code-mode RPC is unavailable: ${call.value.method}`,
						id: call.value.id,
						type: 'call-result'
					})
					return
				}
				let candidate: unknown
				try {
					candidate = handler(call.value.input)
				} catch (cause) {
					worker.postMessage({
						error: cause instanceof Error ? cause.message : 'code-mode RPC handler threw',
						id: call.value.id,
						type: 'call-result'
					})
					return
				}
				if (!isDynamicEffect(candidate)) {
					worker.postMessage({
						error: `code-mode RPC did not return an Effect: ${call.value.method}`,
						id: call.value.id,
						type: 'call-result'
					})
					return
				}
				const executable = pipe(
					// @effect-diagnostics-next-line anyUnknownInErrorContext:off
					candidate,
					Effect.provide(input.layer),
					Effect.provideContext(Context.makeUnsafe<unknown>(new Map<string, never>())),
					Effect.exit
				)
				const controller = new AbortController()
				calls.set(call.value.id, controller)
				// @effect-diagnostics-next-line runEffectInsideEffect:off
				void Effect.runPromise(executable, {signal: controller.signal})
					.then(exit => {
						if (Exit.isSuccess(exit)) {
							worker.postMessage({id: call.value.id, type: 'call-result', value: exit.value})
						} else {
							worker.postMessage({
								error: `code-mode RPC failed: ${call.value.method}`,
								id: call.value.id,
								type: 'call-result'
							})
						}
					})
					.catch(() => {})
					.finally(() => {
						calls.delete(call.value.id)
					})
				return
			}
			const result = Schema.decodeUnknownOption(WorkerResult)(message)
			if (result._tag === 'Some') {
				finish(Effect.succeed(result.value.value))
				return
			}
			const failure = Schema.decodeUnknownOption(WorkerFailure)(message)
			if (failure._tag === 'Some') finish(Effect.fail(CodeModeError.make({message: failure.value.message})))
		})
		worker.on('error', cause => {
			finish(Effect.fail(workerError(cause, 'code-mode worker failed')))
		})
		worker.on('exit', code => {
			if (!settled && code !== 0) finish(Effect.fail(CodeModeError.make({message: `code-mode worker exited ${code}`})))
		})
		return Effect.sync(() => {
			cancelCalls()
			clearTimeout(deadline)
			void worker.terminate()
		})
	})
	return yield* pipe(
		Schema.encodeUnknownEffect(Schema.Json)(Predicate.isUndefined(value) ? jsonNull : value),
		Effect.mapError(cause => CodeModeError.make({cause, message: 'code-mode result is not JSON-safe'}))
	)
})
