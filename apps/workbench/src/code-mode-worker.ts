import vm from 'node:vm'
import {parentPort, workerData} from 'node:worker_threads'

import * as effect from 'effect'
import {Array, Context, Effect, Predicate, Record, Schema, pipe} from 'effect'

import {AgentRpcContracts} from './rpcs/contracts.ts'

const Input = Schema.Struct({
	context: Schema.Record(Schema.String, Schema.Unknown),
	methods: Schema.Array(Schema.String),
	source: Schema.String
})
const Response = Schema.Struct({
	error: Schema.optional(Schema.String),
	id: Schema.Finite,
	type: Schema.Literal('call-result'),
	value: Schema.optional(Schema.Unknown)
})

class WorkerRpcError extends Schema.TaggedErrorClass<WorkerRpcError>()('WorkerRpcError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

function requireParentPort() {
	const value = parentPort
	if (!value) throw new Error('code-mode worker requires a parent port')
	return value
}

const input = Schema.decodeUnknownSync(Input)(workerData)
const port = requireParentPort()

let requestId = 0
const pending = new Map<number, {readonly reject: (cause: Error) => void; readonly resolve: (value: unknown) => void}>()
port.on('message', (message: unknown) => {
	const response = Schema.decodeUnknownOption(Response)(message)
	if (response._tag === 'None') return
	const request = pending.get(response.value.id)
	if (Predicate.isUndefined(request)) return
	pending.delete(response.value.id)
	if (Predicate.isNotUndefined(response.value.error)) request.reject(new Error(response.value.error))
	else request.resolve(response.value.value)
})

function rpcEffect(method: string, payload: unknown) {
	return Effect.tryPromise({
		catch: cause => WorkerRpcError.make({cause, message: `code-mode RPC ${method} failed`}),
		try: async () => {
			const rpc = AgentRpcContracts.requests.get(method)
			if (Predicate.isUndefined(rpc)) throw WorkerRpcError.make({message: `unknown code-mode RPC ${method}`})
			const encoded = await Schema.encodeUnknownPromise(rpc.payloadSchema)(payload)
			const value = await new Promise<unknown>((resolve, reject) => {
				const id = requestId
				requestId += 1
				pending.set(id, {reject, resolve})
				port.postMessage({id, input: encoded, method, type: 'call'})
			})
			return await Schema.decodeUnknownPromise(rpc.successSchema)(value)
		}
	})
}

const client = Record.fromEntries(
	input.methods.map(method => [method, (payload: unknown) => rpcEffect(method, payload)])
)
const exposed = new WeakMap<object, unknown>()
const originals = new WeakMap<object, object>()
type Callable = (...argumentsList: unknown[]) => unknown
function isCallable(value: unknown): value is Callable {
	return typeof value === 'function'
}

function hiddenPrototype() {
	// eslint-disable-next-line unicorn/no-null
	return null
}

function original(value: unknown): unknown {
	if ((typeof value !== 'object' || Predicate.isNull(value)) && typeof value !== 'function') return value
	return originals.get(value) ?? value
}

function expose(value: unknown): unknown {
	if ((typeof value !== 'object' || Predicate.isNull(value)) && typeof value !== 'function') return value
	const cached = exposed.get(value)
	if (Predicate.isNotUndefined(cached)) return cached
	const target = value
	let proxy: object
	if (isCallable(target)) {
		const callableTarget = target
		function forwarding(...argumentsList: unknown[]) {
			// eslint-disable-next-line no-restricted-globals
			return Reflect.apply(callableTarget, undefined, argumentsList)
		}
		proxy = new Proxy<Callable>(forwarding, {
			apply: (_forwarding, thisArgument, argumentsList: unknown[]) =>
				// eslint-disable-next-line no-restricted-globals
				expose(Reflect.apply(callableTarget, original(thisArgument), argumentsList.map(original))),
			get: (_forwarding, property) => {
				if (property === 'constructor') return
				// eslint-disable-next-line no-restricted-globals
				return expose(Reflect.get(callableTarget, property, callableTarget))
			},
			getPrototypeOf: hiddenPrototype
		})
	} else {
		const forwarding: object = Array.isArray(target) ? [] : {}
		proxy = new Proxy(forwarding, {
			get: (_forwarding, property) => {
				if (property === 'constructor') return
				// eslint-disable-next-line no-restricted-globals
				return expose(Reflect.get(target, property, target))
			},
			getPrototypeOf: hiddenPrototype,
			set: (_forwarding, property, next) =>
				// eslint-disable-next-line no-restricted-globals
				Reflect.set(target, property, original(next), target)
		})
	}
	exposed.set(value, proxy)
	originals.set(proxy, value)
	return proxy
}

const sandbox = {client: expose(client), context: expose(input.context), effect: expose(effect)}
const context = vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}})

function isDynamicEffect(value: unknown): value is Effect.Effect<unknown, unknown, unknown> {
	return Effect.isEffect(value)
}

try {
	const evaluated: unknown = new vm.Script(`(${input.source})`, {filename: 'code-mode.js'}).runInContext(context)
	const dynamic = original(evaluated)
	if (!isDynamicEffect(dynamic)) throw new Error('code-mode source did not return an Effect')
	const executable = pipe(
		// @effect-diagnostics-next-line anyUnknownInErrorContext:off
		dynamic,
		Effect.provideContext(Context.makeUnsafe<unknown>(new Map<string, never>())),
		Effect.mapError(cause => WorkerRpcError.make({cause, message: 'code-mode effect failed'}))
	)
	const value: unknown = await Effect.runPromise(executable)
	const JsonString = Schema.fromJsonString(Schema.Json)
	const serializable = Schema.decodeUnknownSync(JsonString)(Schema.encodeUnknownSync(JsonString)(value))
	port.postMessage({type: 'result', value: serializable})
} catch (cause) {
	let message = 'code-mode worker failed'
	if (cause instanceof Error) message = cause.message
	else if (Predicate.hasProperty(cause, 'message') && Predicate.isString(cause.message)) message = cause.message
	port.postMessage({message, type: 'failure'})
}
