import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {Effect, Option, Schema} from 'effect'

import {RepoPath, Repository} from './schema.ts'

const reposIndexKey = 'index:repos'

export class GitStore extends Effect.Service<GitStore>()('@ai-toolkit/git/GitStore', {
	accessors: true,
	effect: Effect.gen(function* () {
		const kv = KeyValueStore.prefix('git:')(yield* KeyValueStore.KeyValueStore)
		const repoStore = kv.forSchema(Repository)
		const indexStore = kv.forSchema(Schema.Array(Schema.String))

		function readIndex(key: string) {
			return indexStore.get(key).pipe(Effect.map(option => Option.getOrElse(option, () => [] as readonly string[])))
		}

		function writeIndex(key: string, values: readonly string[]) {
			return indexStore.set(key, values)
		}

		return {
			saveRepository: Effect.fnUntraced(function* (repository: Repository) {
				yield* repoStore.set(`repo:${repository.path as string}`, repository)
				const current = yield* readIndex(reposIndexKey)
				const pathString = repository.path as string
				if (!current.includes(pathString)) yield* writeIndex(reposIndexKey, [...current, pathString])
				return repository
			}),

			listRepositories: Effect.fnUntraced(function* () {
				const paths = yield* readIndex(reposIndexKey)
				return yield* Effect.forEach(paths, path =>
					repoStore.get(`repo:${path}`).pipe(
						Effect.map(option =>
							Option.getOrElse(option, () => Repository.make({path: path as RepoPath, name: path, lastOpenedAt: Date.now()}))
						)
					)
				)
			}),

			getRepository: Effect.fnUntraced(function* (path: RepoPath) {
				return yield* repoStore.get(`repo:${path}`)
			})
		}
	})
}) {}
