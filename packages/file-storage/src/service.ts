import {Context, Effect, FileSystem, Layer, Path, String, pipe} from 'effect'

import {FileStorageError, StoredFile} from './schema.ts'

type FileStorageConfig = {readonly directory: string}

function validateId(id: string) {
	return id !== '' &&
		!String.startsWith('/')(id) &&
		!String.includes('\\')(id) &&
		!String.split('/')(id).some(part => part === '' || part === '.' || part === '..')
		? Effect.void
		: FileStorageError.make({message: 'file id must be a path-safe relative path'})
}

export class FileStorage extends Context.Service<FileStorage>()('@deslop/file-storage/service/FileStorage', {
	make: Effect.fnUntraced(function* (config: FileStorageConfig) {
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		yield* pipe(
			fs.makeDirectory(config.directory, {recursive: true}),
			Effect.mapError(cause => FileStorageError.make({cause, message: 'failed to create storage directory'}))
		)

		const resolve = Effect.fnUntraced(function* (id: string) {
			yield* validateId(id)
			return path.join(config.directory, ...String.split('/')(id))
		})

		return {
			get: Effect.fn('FileStorage.get')(function* (id: string) {
				return yield* pipe(
					resolve(id),
					Effect.flatMap(fs.readFile),
					Effect.mapError(cause => FileStorageError.make({cause, message: `failed to read ${id}`}))
				)
			}),
			put: Effect.fn('FileStorage.put')(function* (input: {readonly id: string; readonly bytes: Uint8Array}) {
				const file = yield* resolve(input.id)
				yield* pipe(
					fs.makeDirectory(path.dirname(file), {recursive: true}),
					Effect.andThen(fs.writeFile(file, input.bytes)),
					Effect.mapError(cause => FileStorageError.make({cause, message: `failed to store ${input.id}`}))
				)
				return StoredFile.make({id: input.id})
			})
		}
	})
}) {
	public static layer = (config: FileStorageConfig) => Layer.effect(this, this.make(config))
}
