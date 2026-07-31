import {NodeServices} from '@effect/platform-node'
import {assert, describe, it} from '@effect/vitest'

import {Effect, FileSystem, Path} from 'effect'

import {FileStorage} from './service.ts'

describe('FileStorage', () => {
	it.effect('stores arbitrary bytes by caller-supplied id', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const directory = yield* fs.makeTempDirectoryScoped()
			const storage = yield* FileStorage.make({directory})
			const bytes = new Uint8Array([0, 1, 2, 255])

			assert.deepStrictEqual(yield* storage.put({bytes, id: 'nested/value.bin'}), {id: 'nested/value.bin'})
			assert.deepStrictEqual(yield* storage.get('nested/value.bin'), bytes)
			assert.strictEqual(yield* fs.exists(path.join(directory, 'nested', 'value.bin')), true)
		}).pipe(Effect.provide(NodeServices.layer))
	)

	it.effect('rejects traversal ids', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const directory = yield* fs.makeTempDirectoryScoped()
			const storage = yield* FileStorage.make({directory})
			const failure = yield* Effect.flip(storage.put({bytes: new Uint8Array(), id: '../outside'}))
			assert.strictEqual(failure._tag, 'FileStorageError')
		}).pipe(Effect.provide(NodeServices.layer))
	)
})
