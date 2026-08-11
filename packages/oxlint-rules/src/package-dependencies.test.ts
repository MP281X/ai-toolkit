import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Array, Effect, FileSystem, HashSet, Path, Record, Schema, pipe} from 'effect'

type PackageManifest = typeof PackageManifest.Type
const PackageManifest = Schema.fromJsonString(
	Schema.Struct({
		dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String))
	})
)

function dependencyNames(manifest: PackageManifest) {
	return pipe(
		[
			manifest.dependencies ?? {},
			manifest.devDependencies ?? {},
			manifest.optionalDependencies ?? {},
			manifest.peerDependencies ?? {}
		],
		Array.flatMap(Record.keys)
	)
}

describe('workspace dependency ownership', () => {
	it.layer(NodeServices.layer)(testApi => {
		testApi.effect('keeps root dependencies out of workspace manifests', () =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const root = path.resolve(import.meta.dirname, '../../..')
				const rootManifest = yield* pipe(
					fs.readFileString(path.join(root, 'package.json')),
					Effect.flatMap(Schema.decodeEffect(PackageManifest))
				)
				const rootDependencies = HashSet.fromIterable(dependencyNames(rootManifest))
				const manifests = yield* pipe(
					['apps', 'packages'],
					Effect.forEach(directory =>
						pipe(
							fs.readDirectory(path.join(root, directory)),
							Effect.map(Array.map(name => path.join(root, directory, name, 'package.json')))
						)
					),
					Effect.map(Array.flatten)
				)

				for (const manifestPath of manifests) {
					const manifest = yield* pipe(
						fs.readFileString(manifestPath),
						Effect.flatMap(Schema.decodeEffect(PackageManifest))
					)
					const duplicates = Array.filter(dependencyNames(manifest), name => HashSet.has(rootDependencies, name))
					expect(duplicates, manifestPath).toEqual([])
				}
			})
		)
	})
})
