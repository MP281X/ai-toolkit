import {
	Array,
	Cause,
	DateTime,
	Effect,
	Option,
	Queue,
	Ref,
	Schema,
	Scope,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import type {Prompt} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import type {AgentStatus} from '../service.ts'
import {Agent} from '../service.ts'

import * as CodexRpc from '#codegen/codex-app-server/meta.gen.ts'
import {serializeAiPartToMarkdown} from '#lib/utils.ts'

class CodexProtocolError extends Schema.TaggedErrorClass<CodexProtocolError>()('CodexProtocolError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

const JsonRpcRequest = Schema.Struct({
	id: Schema.Union([Schema.Number, Schema.String]),
	method: Schema.String,
	params: Schema.optional(Schema.Defect)
})

const JsonRpcResponse = Schema.Struct({
	error: Schema.optional(Schema.Struct({message: Schema.optional(Schema.String)})),
	id: Schema.Union([Schema.Number, Schema.String]),
	result: Schema.optional(Schema.Defect)
})

const JsonRpcNotification = Schema.Struct({method: Schema.String, params: Schema.optional(Schema.Defect)})

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isJsonRpcRequest(value: unknown) {
	return isRecord(value) && typeof value['method'] === 'string' && 'id' in value
}

function isJsonRpcNotification(value: unknown) {
	return isRecord(value) && typeof value['method'] === 'string' && !('id' in value)
}

function isJsonRpcResponse(value: unknown) {
	return isRecord(value) && 'id' in value && !('method' in value)
}

type ClientRequestMethod = CodexRpc.ClientRequestMethod
type ClientRequestPayload<M extends ClientRequestMethod> = CodexRpc.ClientRequestParamsByMethod[M]
type ClientRequestResponse<M extends ClientRequestMethod> = CodexRpc.ClientRequestResponsesByMethod[M]

function encodeClientPayload<M extends ClientRequestMethod>(method: M, payload: ClientRequestPayload<M>) {
	const schema = CodexRpc.CLIENT_REQUEST_PARAMS[method]
	return schema ? Schema.encodeUnknownSync(schema as never)(payload) : payload
}

function decodeClientResponse<M extends ClientRequestMethod>(method: M, payload: unknown) {
	const schema = CodexRpc.CLIENT_REQUEST_RESPONSES[method]
	return schema
		? (Schema.decodeUnknownSync(schema as never)(payload) as ClientRequestResponse<M>)
		: (payload as ClientRequestResponse<M>)
}

function decodeServerNotification<M extends CodexRpc.ServerNotificationMethod>(method: M, payload: unknown) {
	const schema = CodexRpc.SERVER_NOTIFICATION_PARAMS[method]
	return Schema.decodeUnknownOption(schema as never)(payload) as Option.Option<
		CodexRpc.ServerNotificationParamsByMethod[M]
	>
}

const textDecoder = new TextDecoder()

const makeCodexClient = Effect.fnUntraced(function* (config: {readonly cwd: string}) {
	const child = yield* Effect.sync(() =>
		Bun.spawn(['codex', 'app-server'], {cwd: config.cwd, env: Bun.env, stderr: 'pipe', stdin: 'pipe', stdout: 'pipe'})
	)
	yield* Scope.addFinalizer(
		yield* Scope.Scope,
		Effect.sync(() => {
			child.kill()
		})
	)

	const notifications = yield* Queue.unbounded<Schema.Schema.Type<typeof JsonRpcNotification>>()
	const pending = yield* Ref.make(new Map<string, Queue.Queue<unknown>>())
	const nextRequestId = yield* Ref.make(1)

	const handleMessage = Effect.fnUntraced(function* (message: unknown) {
		if (isJsonRpcResponse(message)) {
			const response = Schema.decodeUnknownOption(JsonRpcResponse)(message)
			if (Option.isSome(response)) {
				const queue = yield* Ref.modify(pending, entries => {
					const next = new Map(entries)
					next.delete(`${response.value.id}`)
					return [entries.get(`${response.value.id}`), next] as const
				})
				if (queue) {
					if (response.value.error) {
						yield* Queue.offer(queue, new Error(response.value.error.message ?? 'Codex app-server request failed'))
					} else {
						yield* Queue.offer(queue, response.value.result)
					}
				}
			}
			return
		}

		if (isJsonRpcNotification(message)) {
			const notification = Schema.decodeUnknownOption(JsonRpcNotification)(message)
			if (Option.isSome(notification)) yield* Queue.offer(notifications, notification.value)
			return
		}

		if (!isJsonRpcRequest(message)) return

		const request = Schema.decodeUnknownSync(JsonRpcRequest)(message)
		if (
			request.method === 'item/commandExecution/requestApproval' ||
			request.method === 'item/fileChange/requestApproval'
		) {
			yield* writeJson(child, {id: request.id, result: {decision: 'accept'}})
		} else {
			yield* writeJson(child, {error: {code: -32_601, message: `Method not found: ${request.method}`}, id: request.id})
		}
	})

	yield* pipe(
		readLines(child.stdout, line =>
			pipe(
				Effect.try({
					catch: cause => new CodexProtocolError({cause, message: 'Failed to decode Codex app-server message'}),
					try: () => JSON.parse(line)
				}),
				Effect.flatMap(handleMessage),
				Effect.catchCause(cause => pipe(Effect.logDebug('codex app-server decode error'), Effect.annotateLogs({cause})))
			)
		),
		Effect.forkScoped
	)
	yield* pipe(
		readLines(child.stderr, line => pipe(Effect.logDebug('codex app-server stderr'), Effect.annotateLogs({line}))),
		Effect.forkScoped
	)

	const request = Effect.fnUntraced(function* <M extends ClientRequestMethod>(
		method: M,
		params: ClientRequestPayload<M>
	) {
		const id = yield* Ref.modify(nextRequestId, current => [current, current + 1] as const)
		const queue = yield* Queue.bounded<unknown>(1)
		yield* Ref.update(pending, entries => new Map([...entries, [`${id}`, queue]]))
		const encodedParams = encodeClientPayload(method, params)
		yield* pipe(
			writeJson(child, {id, method, ...(encodedParams !== undefined ? {params: encodedParams} : {})}),
			Effect.orDie
		)
		const response = yield* pipe(
			Queue.take(queue),
			Effect.ensuring(
				Ref.update(pending, entries => {
					const next = new Map(entries)
					next.delete(`${id}`)
					return next
				})
			)
		)
		if (response instanceof Error) return yield* Effect.die(response)
		return decodeClientResponse(method, response)
	})

	yield* request('initialize', {
		capabilities: {experimentalApi: true, optOutNotificationMethods: null},
		clientInfo: {name: '@ai-toolkit/ai', title: 'AI Toolkit', version: '0.0.0'}
	})
	yield* pipe(writeJson(child, {method: 'initialized'}), Effect.orDie)

	return {notifications, request}
})

const readLines = Effect.fnUntraced(function* (
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => Effect.Effect<void>
) {
	yield* Effect.callback<void>(resume => {
		let remainder = ''

		void (async () => {
			const reader = stream.getReader()
			while (true) {
				const next = await reader.read()
				if (next.done) {
					break
				}
				const lines = String.split('\n')(`${remainder}${textDecoder.decode(next.value, {stream: true})}`)
				remainder = pipe(
					lines,
					Array.last,
					Option.getOrElse(() => '')
				)
				for (const line of Array.dropRight(lines, 1)) {
					if (String.isNonEmpty(String.trim(line))) Effect.runFork(onLine(line))
				}
			}
			resume(Effect.void)
		})()
	})
})

const writeJson = Effect.fnUntraced(function* (process: Bun.Subprocess<'pipe', 'pipe', 'pipe'>, message: unknown) {
	yield* Effect.promise(async () => process.stdin.write(new TextEncoder().encode(`${JSON.stringify(message)}\n`)))
})

export const makeLayerCodex = Effect.fnUntraced(function* (config: {
	readonly cwd: string
	readonly sessionId?: string
	readonly systemPrompt: Prompt.SystemMessage
}) {
	const client = yield* makeCodexClient({cwd: config.cwd})
	const threadStartParams = {
		approvalPolicy: 'on-request',
		cwd: config.cwd,
		developerInstructions: config.systemPrompt.content,
		model: 'gpt-5.1-codex',
		sandbox: 'workspace-write'
	} satisfies CodexRpc.ClientRequestParamsByMethod['thread/start']
	const thread = yield* config.sessionId
		? client.request('thread/resume', {threadId: config.sessionId, ...threadStartParams})
		: client.request('thread/start', threadStartParams)
	const history = yield* Ref.make<readonly Prompt.Message[]>([])
	const currentTurnId = yield* Ref.make(Option.none<string>())
	const status = yield* SubscriptionRef.make<AgentStatus>({state: 'idle', updatedAt: yield* DateTime.now} as const)
	const setStatusIfRunning = Effect.fnUntraced(function* (state: AgentStatus['state']) {
		const current = yield* SubscriptionRef.get(status)
		if (current.state === 'running') {
			yield* SubscriptionRef.set(status, {state, updatedAt: yield* DateTime.now} as const)
		}
	})
	const interruptCurrentTurn = Effect.fnUntraced(function* () {
		const turnId = yield* Ref.get(currentTurnId)
		if (Option.isSome(turnId)) {
			yield* pipe(client.request('turn/interrupt', {threadId: thread.thread.id, turnId: turnId.value}), Effect.ignore)
			yield* Ref.set(currentTurnId, Option.none())
		}
	})

	return Agent.of({
		history: Ref.get(history),
		status,
		streamText: input =>
			Stream.callback(
				Effect.fnUntraced(function* (queue) {
					let completed = false
					yield* pipe(
						Effect.gen(function* () {
							yield* Ref.set(history, input.messages)
							yield* SubscriptionRef.set(status, {state: 'running', updatedAt: yield* DateTime.now} as const)
							const turn = yield* client.request('turn/start', {
								approvalPolicy: 'on-request',
								input: [{text: serializeAiPartToMarkdown(input.messages).markdown, text_elements: [], type: 'text'}],
								model: input.model,
								sandboxPolicy: {
									excludeSlashTmp: false,
									excludeTmpdirEnvVar: false,
									networkAccess: false,
									type: 'workspaceWrite',
									writableRoots: [config.cwd]
								},
								threadId: thread.thread.id
							})
							yield* Ref.set(currentTurnId, Option.some(turn.turn.id))

							while (true) {
								const notification = yield* Queue.take(client.notifications)
								if (notification.method === 'turn/started') {
									const params = decodeServerNotification(notification.method, notification.params)
									if (Option.isSome(params) && params.value.threadId === thread.thread.id) {
										yield* Ref.set(currentTurnId, Option.some(params.value.turn.id))
									}
								}
								if (notification.method === 'item/agentMessage/delta') {
									const params = decodeServerNotification(notification.method, notification.params)
									if (Option.isSome(params) && params.value.threadId === thread.thread.id) {
										yield* Queue.offer(
											queue,
											Response.makePart('text-delta', {delta: params.value.delta, id: params.value.turnId})
										)
									}
								}
								if (notification.method === 'error') {
									const params = decodeServerNotification(notification.method, notification.params)
									if (Option.isSome(params) && (!params.value.threadId || params.value.threadId === thread.thread.id)) {
										yield* SubscriptionRef.set(status, {state: 'error', updatedAt: yield* DateTime.now} as const)
										yield* Queue.offer(queue, Response.makePart('error', {error: params.value.error.message}))
										yield* Queue.end(queue)
										return
									}
								}
								if (notification.method === 'item/completed') {
									const params = decodeServerNotification(notification.method, notification.params)
									if (Option.isSome(params) && params.value.threadId === thread.thread.id) {
										const item = params.value.item
										if (item.type === 'reasoning') {
											const summary = item.summary ?? []
											const content = item.content ?? []
											yield* Queue.offer(
												queue,
												Response.makePart('reasoning-delta', {
													delta: Array.join('\n')([...summary, ...content]),
													id: item.id
												})
											)
										}
										if (item.type === 'commandExecution') {
											yield* Queue.offer(
												queue,
												Response.makePart('tool-call', {
													id: item.id,
													name: 'command_execution',
													params: {command: item.command},
													providerExecuted: false
												})
											)
											yield* Queue.offer(
												queue,
												Response.makePart('tool-result', {
													encodedResult: {output: item.aggregatedOutput ?? ''},
													id: item.id,
													isFailure: item.exitCode !== 0,
													name: 'command_execution',
													preliminary: false,
													providerExecuted: false,
													result: {output: item.aggregatedOutput ?? ''}
												})
											)
										}
										if (item.type === 'fileChange') {
											yield* Queue.offer(
												queue,
												Response.makePart('tool-call', {
													id: item.id,
													name: 'file_change',
													params: {changes: item.changes},
													providerExecuted: false
												})
											)
											yield* Queue.offer(
												queue,
												Response.makePart('tool-result', {
													encodedResult: {changes: item.changes},
													id: item.id,
													isFailure: item.status !== 'completed',
													name: 'file_change',
													preliminary: false,
													providerExecuted: false,
													result: {changes: item.changes}
												})
											)
										}
										if (item.type === 'mcpToolCall') {
											yield* Queue.offer(
												queue,
												Response.makePart('tool-call', {
													id: item.id,
													name: 'mcp_tool_call',
													params: {server: item.server, tool: item.tool},
													providerExecuted: false
												})
											)
											yield* Queue.offer(
												queue,
												Response.makePart('tool-result', {
													encodedResult: {
														server: item.server,
														text: JSON.stringify(item.result ?? item.error ?? ''),
														tool: item.tool
													},
													id: item.id,
													isFailure: item.error !== null,
													name: 'mcp_tool_call',
													preliminary: false,
													providerExecuted: false,
													result: {
														server: item.server,
														text: JSON.stringify(item.result ?? item.error ?? ''),
														tool: item.tool
													}
												})
											)
										}
										if (item.type === 'webSearch') {
											yield* Queue.offer(
												queue,
												Response.makePart('tool-call', {
													id: item.id,
													name: 'web_search',
													params: {query: item.query},
													providerExecuted: false
												})
											)
										}
									}
								}
								if (notification.method === 'turn/completed') {
									const params = decodeServerNotification(notification.method, notification.params)
									if (Option.isSome(params) && params.value.threadId === thread.thread.id) {
										completed = true
										yield* Ref.set(currentTurnId, Option.none())
										yield* SubscriptionRef.set(status, {state: 'idle', updatedAt: yield* DateTime.now} as const)
										yield* Queue.offer(
											queue,
											Response.makePart('finish', {
												reason: 'stop',
												response: undefined,
												usage: new Response.Usage({
													inputTokens: {
														cacheRead: undefined,
														cacheWrite: undefined,
														total: undefined,
														uncached: undefined
													},
													outputTokens: {reasoning: undefined, text: undefined, total: undefined}
												})
											})
										)
										yield* Queue.end(queue)
										return
									}
								}
							}
						}),
						Effect.catchCause(cause =>
							pipe(
								setStatusIfRunning('error'),
								Effect.andThen(Queue.offer(queue, Response.makePart('error', {error: Cause.pretty(cause)}))),
								Effect.andThen(Queue.end(queue))
							)
						),
						Effect.ensuring(
							Effect.gen(function* () {
								if (!completed) yield* interruptCurrentTurn()
								yield* setStatusIfRunning('idle')
							})
						)
					)
				})
			)
	})
})
