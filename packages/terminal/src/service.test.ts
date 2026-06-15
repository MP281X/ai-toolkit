import {Effect, Stream} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {Terminal} from './service.ts'

class FakeTerminalProcess {
	public data: ((chunk: string) => void) | undefined
	public exit: ((event: {readonly exitCode: number}) => void) | undefined
	public readonly kills: string[] = []
	public readonly resizes: {readonly cols: number; readonly rows: number}[] = []
	public readonly writes: string[] = []

	public emitExit(exitCode: number) {
		this.exit?.({exitCode})
	}

	public kill(signal?: string) {
		if (signal !== undefined) this.kills.push(signal)
	}

	public onData(callback: (chunk: string) => void) {
		this.data = callback
		return {
			dispose: () => {
				this.data = undefined
			}
		}
	}

	public onExit(callback: (event: {readonly exitCode: number}) => void) {
		this.exit = callback
		return {
			dispose: () => {
				this.exit = undefined
			}
		}
	}

	public resize(cols: number, rows: number) {
		this.resizes.push({cols, rows})
	}

	public write(data: string) {
		this.writes.push(data)
	}
}

class FakeTerminalSpawner {
	public readonly processes: FakeTerminalProcess[] = []

	public spawn = () => {
		const process = new FakeTerminalProcess()
		this.processes.push(process)
		return process
	}
}

describe('@deslop/terminal service', () => {
	it('escalates stopped PTYs that do not emit an exit event', async () => {
		const fake = new FakeTerminalSpawner()

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const terminal = yield* Terminal.make({cwd: '/tmp/project', spawn: fake.spawn})
					yield* terminal.restart({cols: 80, rows: 24})
					yield* terminal.stop()
				})
			)
		)

		expect(fake.processes[0]?.kills).toEqual(['SIGTERM', 'SIGKILL'])
	})

	it('does not resurrect a shell after explicit stop during delayed restart', async () => {
		const fake = new FakeTerminalSpawner()

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const terminal = yield* Terminal.make({cwd: '/tmp/project', spawn: fake.spawn})
					yield* Stream.runCollect(Stream.take(terminal.attach({cols: 80, rows: 24}), 1))
					fake.processes[0]?.emitExit(0)
					yield* Effect.sleep('10 millis')
					yield* terminal.stop()
					yield* Effect.sleep('1100 millis')
				})
			)
		)

		expect(fake.processes).toHaveLength(1)
		expect(fake.processes[0]?.kills).toEqual(['SIGTERM'])
	})
})
