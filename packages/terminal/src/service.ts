import {Array, Context, Effect, Layer, Queue, Stream, SubscriptionRef, flow, pipe} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import {Terminal as HeadlessTerminal} from '@xterm/headless'

import type {TerminalEvent} from './schema.ts'
import {TerminalError} from './schema.ts'

function parseProcessParents(output: string) {
	const parents = new Map<number, number>()

	for (const line of output.split('\n')) {
		const columns = line.trim().split(/\s+/)
		const pid = Number(columns[0])
		const ppid = Number(columns[1])
		if (Number.isFinite(pid) && Number.isFinite(ppid)) parents.set(pid, ppid)
	}

	return parents
}

function parseListeningPorts(output: string) {
	const ports: {readonly pid: number; readonly port: number}[] = []

	for (const line of output.split('\n')) {
		const columns = line.trim().split(/\s+/)
		const port = Number(columns[3]?.match(/:(\d+)$/)?.[1])
		const pid = Number(line.match(/pid=(\d+)/)?.[1])

		if (Number.isFinite(port) && Number.isFinite(pid)) ports.push({pid, port})
	}

	return ports
}

function isDescendant(pid: number, ancestorPid: number, parents: ReadonlyMap<number, number>) {
	let current = pid
	const seen = new Set<number>()

	while (!seen.has(current)) {
		if (current === ancestorPid) return true
		seen.add(current)

		const parent = parents.get(current)
		if (!parent || parent === current) return false
		current = parent
	}

	return false
}

const readProcessParents = Effect.tryPromise({
	catch: cause => new TerminalError({cause, message: 'failed to list terminal processes'}),
	try: () => Bun.$`ps -eo pid=,ppid=`.quiet().text()
}).pipe(Effect.map(parseProcessParents))

const readListeningPorts = Effect.tryPromise({
	catch: cause => new TerminalError({cause, message: 'failed to list terminal ports'}),
	try: () => Bun.$`ss -H -ltnp`.quiet().text()
}).pipe(Effect.map(parseListeningPorts))

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {readonly cwd: string}) {
		let cols = 120
		let rows = 32
		let processHandle: ReturnType<typeof Bun.spawn> | undefined
		const portOwners = new Map<number, number>()
		const ports = yield* SubscriptionRef.make<readonly number[]>([])
		const decoder = new TextDecoder()
		let screenParsed = Promise.resolve()
		const readySubscribers = new WeakSet<Queue.Queue<TerminalEvent>>()
		const subscribers = new Set<Queue.Queue<TerminalEvent>>()
		const screen = new HeadlessTerminal({allowProposedApi: true, cols, rows, scrollback: 10_000})
		const serialize = new SerializeAddon()
		screen.loadAddon(serialize)
		const refreshPorts = Effect.gen(function* () {
			const shellPid = processHandle?.pid
			if (!shellPid) return

			const [parents, listeningPorts] = yield* Effect.all([readProcessParents, readListeningPorts])
			const nextPortOwners = new Map<number, number>()
			const nextPorts = pipe(
				listeningPorts,
				Array.filter(port => isDescendant(port.pid, shellPid, parents)),
				Array.map(port => {
					nextPortOwners.set(port.port, port.pid)
					return port.port
				}),
				Array.dedupe
			)
			nextPorts.sort((left, right) => left - right)

			portOwners.clear()
			for (const [port, pid] of nextPortOwners) portOwners.set(port, pid)

			const currentPorts = yield* SubscriptionRef.get(ports)
			if (currentPorts.length !== nextPorts.length || currentPorts.some((port, index) => port !== nextPorts[index])) {
				yield* SubscriptionRef.set(ports, nextPorts)
			}
		})
		const waitForScreen = Effect.promise(async function wait() {
			const parsed = screenParsed
			await parsed
			if (parsed !== screenParsed) return wait()
		})

		yield* Effect.forkScoped(
			Effect.forever(
				Effect.gen(function* () {
					const subprocess = yield* Effect.acquireRelease(
						Effect.try({
							catch: cause => new TerminalError({cause, message: `failed to spawn terminal in ${config.cwd}`}),
							try: () => {
								const subprocess = Bun.spawn([Bun.env['SHELL'] ?? 'bash'], {
									cwd: config.cwd,
									env: {...Bun.env, TERM: 'xterm-256color'},
									terminal: {
										cols,
										data: (_terminal, data) => {
											const text = decoder.decode(data, {stream: true})
											screenParsed = Effect.runPromise(
												Effect.callback<void>(resume => {
													screen.write(text, () => {
														resume(Effect.void)
													})
												})
											)
											for (const subscriber of subscribers) {
												if (readySubscribers.has(subscriber)) {
													Queue.offerUnsafe(subscriber, {data: text, type: 'data'})
												}
											}
										},
										rows
									}
								})
								processHandle = subprocess
								return subprocess
							}
						}),
						subprocess =>
							Effect.sync(() => {
								if (processHandle === subprocess) processHandle = undefined
								subprocess.terminal?.close()
								subprocess.kill()
							})
					)

					yield* Effect.promise(async () => {
						await subprocess.exited
					})
					yield* Effect.sleep('250 millis')
				})
			)
		)
		yield* Effect.forkScoped(
			Effect.forever(
				pipe(
					refreshPorts,
					Effect.ignore,
					Effect.flatMap(() => Effect.sleep('1 second'))
				)
			)
		)

		yield* Effect.addFinalizer(() => Effect.sync(() => decoder.decode()))

		return {
			events: Stream.scoped(
				Stream.unwrap(
					pipe(
						Effect.acquireRelease(
							pipe(
								Queue.unbounded<TerminalEvent>(),
								Effect.tap(() => waitForScreen),
								Effect.map(queue => {
									subscribers.add(queue)
									Queue.offerUnsafe(queue, {data: serialize.serialize({scrollback: 10_000}), type: 'snapshot'})
									readySubscribers.add(queue)
									return queue
								})
							),
							subscriber =>
								Effect.all(
									[
										Effect.sync(() => {
											subscribers.delete(subscriber)
										}),
										Queue.shutdown(subscriber)
									],
									{discard: true}
								)
						),
						Effect.map(Stream.fromQueue)
					)
				)
			),
			killPort: (port: number) =>
				Effect.try({
					catch: cause => new TerminalError({cause, message: `failed to kill process on port ${port}`}),
					try: () => {
						const pid = portOwners.get(port)
						if (pid) process.kill(pid)
					}
				}),
			ports,
			resize: (nextSize: {readonly cols: number; readonly rows: number}) =>
				Effect.sync(() => {
					if (nextSize.cols === cols && nextSize.rows === rows) return
					cols = nextSize.cols
					rows = nextSize.rows
					screen.resize(cols, rows)
					processHandle?.terminal?.resize(cols, rows)
				}),
			write: (data: string) => Effect.sync(() => processHandle?.terminal?.write(data))
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
