import {Array, Effect, FileSystem, HashSet, Path, Record, Schema, Stream, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {makeConfig} from './config.ts'

type OxlintManifest = typeof OxlintManifest.Type
const OxlintManifest = Schema.fromJsonString(
	Schema.Struct({bin: Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.String)])})
)
type Json = typeof Json.Type
const Json = Schema.fromJsonString(Schema.Unknown)
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

export const runLint = Effect.fnUntraced(function* (input: {
	arguments?: string[]
	capture?: boolean
	cwd: string
	paths: string[]
}) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const directory = yield* fs.makeTempDirectoryScoped({prefix: 'deslop-linter-'})
	function pluginPath(specifier: string) {
		return path.fromFileUrl(new URL(import.meta.resolve(specifier)))
	}
	const manifestPath = yield* pluginPath('oxlint/package.json')
	const manifest = yield* pipe(fs.readFileString(manifestPath), Effect.flatMap(Schema.decodeEffect(OxlintManifest)))
	const declaredBin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin['oxlint']
	if (declaredBin === undefined) return yield* Effect.die('The oxlint package does not declare its binary.')
	const oxlint = path.resolve(path.dirname(manifestPath), declaredBin)
	const rootManifest = yield* pipe(
		fs.readFileString(path.join(input.cwd, 'package.json')),
		Effect.flatMap(Schema.decodeEffect(PackageManifest))
	)
	const rootDependencies = pipe(rootManifest, dependencyNames, HashSet.fromIterable)
	const manifests = yield* fs.glob('{apps,packages,tools}/*/package.json', {root: input.cwd})
	const duplicates = yield* pipe(
		manifests,
		Array.filter(file => !String.endsWith('tools/linter/package.json')(file)),
		Effect.forEach(file =>
			pipe(
				fs.readFileString(file),
				Effect.flatMap(Schema.decodeEffect(PackageManifest)),
				Effect.map(packageManifest =>
					pipe(
						dependencyNames(packageManifest),
						Array.filter(name => HashSet.has(rootDependencies, name)),
						Array.map(name => ({name, path: path.relative(input.cwd, file)}))
					)
				)
			)
		),
		Effect.map(Array.flatten)
	)
	const configPath = path.join(directory, 'oxlint.json')
	const config = makeConfig({
		deslopPlugin: yield* pluginPath('@deslop/linter/oxlint-plugin'),
		duplicates,
		reactDoctorPlugin: yield* pluginPath('oxlint-plugin-react-doctor')
	})
	yield* fs.writeFileString(configPath, Schema.encodeSync(Json)(config))
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const handle = yield* spawner.spawn(
		ChildProcess.make(oxlint, ['--config', configPath, '--type-aware', ...input.paths, ...(input.arguments ?? [])], {
			cwd: input.cwd,
			stderr: input.capture === true ? 'pipe' : 'inherit',
			stdout: input.capture === true ? 'pipe' : 'inherit'
		})
	)
	if (input.capture !== true) return {exitCode: yield* handle.exitCode, stderr: '', stdout: ''}
	return yield* Effect.all(
		{
			exitCode: handle.exitCode,
			stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
			stdout: Stream.mkString(Stream.decodeText(handle.stdout))
		},
		{concurrency: 'unbounded'}
	)
})
