import {Context, Crypto, Duration, Effect, Layer, Option, Path, Predicate, RcMap, String, pipe} from 'effect'

import {HttpRouter, HttpServerResponse} from 'effect/unstable/http'

import {Asset, AssetError} from './schema.ts'

import {RepositoryName} from '#services/repositories/schema.ts'
import {Repositories} from '#services/repositories/service.ts'
import {FileStorage} from '@deslop/file-storage/service'

function mediaExtension(bytes: Uint8Array): Option.Option<string> {
	function starts(...values: readonly number[]) {
		return values.every((value, index) => bytes[index] === value)
	}
	if (starts(0x89, 0x50, 0x4e, 0x47)) return Option.some('png')
	if (starts(0xff, 0xd8, 0xff)) return Option.some('jpg')
	if (starts(0x47, 0x49, 0x46, 0x38)) return Option.some('gif')
	if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return Option.some('webp')
	if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return Option.some('mp4')
	if (starts(0x1a, 0x45, 0xdf, 0xa3)) return Option.some('webm')
	return Option.none()
}

export class Assets extends Context.Service<Assets>()('@deslop/workbench/services/assets/service/Assets', {
	make: Effect.fnUntraced(function* () {
		const crypto = yield* Crypto.Crypto
		const path = yield* Path.Path
		const repositories = yield* Repositories

		const directory = Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
			const found = yield* repositories.find(repository)
			return path.join(path.dirname(found.path), '.data', 'assets')
		})
		const stores = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: (repository: typeof RepositoryName.Type) =>
				Effect.flatMap(directory(repository), storageDirectory => FileStorage.make({directory: storageDirectory}))
		})
		function storage(repository: typeof RepositoryName.Type) {
			return RcMap.get(stores, repository)
		}

		return {
			get: Effect.fn('Assets.get')(function* (input: {
				readonly id: string
				readonly repository: typeof RepositoryName.Type
			}) {
				if (
					input.id === '' ||
					String.includes('/')(input.id) ||
					String.includes('\\')(input.id) ||
					String.includes('..')(input.id)
				) {
					return yield* AssetError.make({message: 'invalid asset id'})
				}
				return yield* pipe(
					storage(input.repository),
					Effect.flatMap(store => store.get(input.id)),
					Effect.mapError(cause => AssetError.make({cause, message: `failed to read asset ${input.id}`}))
				)
			}),
			http: Effect.fnUntraced(function* () {
				const router = yield* HttpRouter.HttpRouter
				yield* router.add(
					'GET',
					'/assets/:repository/:asset',
					Effect.gen(function* () {
						const params = yield* HttpRouter.params
						const repository = params['repository']
						const id = params['asset']
						if (Predicate.isUndefined(repository) || Predicate.isUndefined(id)) {
							return HttpServerResponse.empty({status: 404})
						}
						return yield* pipe(
							storage(RepositoryName.make(repository)),
							Effect.flatMap(store => store.get(id)),
							Effect.map(HttpServerResponse.uint8Array),
							Effect.orElseSucceed(() => HttpServerResponse.empty({status: 404}))
						)
					}).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({status: 404})))
				)
				return router
			}),
			upload: Effect.fn('Assets.upload')(function* (input: {
				readonly bytes: Uint8Array
				readonly repository: typeof RepositoryName.Type
			}) {
				const extension = mediaExtension(input.bytes)
				if (Option.isNone(extension)) {
					return yield* AssetError.make({message: 'uploaded bytes are not a supported image or video'})
				}
				const id = `${yield* crypto.randomUUIDv4}.${extension.value}`
				yield* pipe(
					storage(input.repository),
					Effect.flatMap(store => store.put({bytes: input.bytes, id})),
					Effect.mapError(cause => AssetError.make({cause, message: 'failed to store asset'}))
				)
				return Asset.make({id, repository: input.repository, url: `/assets/${input.repository}/${id}`})
			})
		}
	})
}) {
	public static layer = Layer.effect(this, this.make())
}
