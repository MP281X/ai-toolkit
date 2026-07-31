import {NodeServices} from '@effect/platform-node'
import {assert, describe, it} from '@effect/vitest'

import {Effect, FileSystem, Path} from 'effect'

import {Processes} from './service.ts'

describe('Processes', () => {
	it.effect('discovers package-qualified workspace scripts', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const root = yield* fs.makeTempDirectoryScoped()
			yield* fs.makeDirectory(path.join(root, 'apps', 'site'), {recursive: true})
			yield* fs.writeFileString(path.join(root, 'package.json'), '{"scripts":{"check":"vp check"}}')
			yield* fs.writeFileString(
				path.join(root, 'apps', 'site', 'package.json'),
				'{"name":"@example/site","scripts":{"dev":"vp dev"}}'
			)
			const processes = yield* Processes.make()

			assert.deepStrictEqual(
				(yield* processes.list(root)).map(process => process.script),
				['check', '@example/site#dev']
			)
		}).pipe(Effect.provide(NodeServices.layer))
	)
})
