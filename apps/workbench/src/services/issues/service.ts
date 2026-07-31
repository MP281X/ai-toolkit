import {
	Array,
	Context,
	Crypto,
	Effect,
	Encoding,
	Equal,
	FileSystem,
	HashMap,
	Layer,
	Option,
	Path,
	Predicate,
	Ref,
	Result,
	Schema,
	Semaphore,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {createTwoFilesPatch} from 'diff'

import type {AgentId} from './schema.ts'
import {
	BranchName,
	ArchivedIssue,
	HistoricalIssue,
	Implementation,
	Issue,
	IssueEntry,
	IssueError,
	PlanHandoff,
	PlanHash
} from './schema.ts'

export declare namespace Issues {
	export type Config = {readonly directory: string; readonly historyDirectory: string}
}

const branchCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789'

function currentPlan(issue: typeof Issue.Type) {
	return pipe(
		issue.planIterations,
		Array.last,
		Option.match({onNone: () => IssueError.make({message: 'issue has no saved plan'}), onSome: Effect.succeed})
	)
}

function semanticSlug(plan: string) {
	const heading = pipe(
		plan,
		String.split(/\r?\n/u),
		Array.findFirst(line => String.isNonEmpty(String.trim(line))),
		Option.getOrElse(() => 'issue'),
		String.replace(/^#+\s*/u, ''),
		String.replace(/[`*_~[\](){}:;,.!?'"\\/]+/gu, ' '),
		String.toLowerCase,
		String.trim,
		String.split(/\s+/u),
		Array.filter(String.isNonEmpty),
		Array.take(5),
		Array.join('-'),
		String.replace(/[^a-z0-9-]/gu, ''),
		String.replace(/-+/gu, '-'),
		String.replace(/^-|-$/gu, '')
	)
	return heading === '' ? 'issue' : String.slice(0, 48)(heading)
}

function decodeBody(body: string) {
	return pipe(Encoding.encodeHex(body), Encoding.decodeHex, Result.getOrThrow)
}

export class Issues extends Context.Service<Issues>()('@deslop/workbench/services/issues/service/Issues', {
	make: Effect.fnUntraced(function* (config: Issues.Config) {
		const crypto = yield* Crypto.Crypto
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const mutations = yield* Ref.make(HashMap.empty<string, Semaphore.Semaphore>())
		yield* Effect.all([
			fs.makeDirectory(config.directory, {recursive: true}),
			fs.makeDirectory(config.historyDirectory, {recursive: true})
		])

		function issuePath(branch: string) {
			return path.join(config.directory, branch, 'issue.json')
		}
		function implementationPath(branch: string) {
			return path.join(config.directory, branch, 'implementation.json')
		}
		const write = Effect.fnUntraced(function* <A, I>(file: string, schema: Schema.Codec<A, I>, value: A) {
			const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(schema))(value)
			const temporary = `${file}.${yield* crypto.randomUUIDv4}.tmp`
			yield* fs.makeDirectory(path.dirname(file), {recursive: true})
			yield* pipe(
				fs.writeFileString(temporary, encoded),
				Effect.andThen(fs.rename(temporary, file)),
				Effect.ensuring(pipe(fs.remove(temporary), Effect.ignore))
			)
		})
		const read = Effect.fnUntraced(function* <A, I>(file: string, schema: Schema.Codec<A, I>) {
			return yield* pipe(
				fs.readFileString(file),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(schema)))
			)
		})
		const load = Effect.fnUntraced(function* () {
			const branches = yield* fs.readDirectory(config.directory)
			return yield* Effect.forEach(
				branches,
				Effect.fnUntraced(function* (branch) {
					const issue = yield* pipe(
						read(issuePath(branch), Issue),
						Effect.mapError(cause => IssueError.make({cause, message: `failed to read issue ${branch}`}))
					)
					const implementation = yield* pipe(
						fs.exists(implementationPath(branch)),
						Effect.flatMap(exists =>
							exists
								? pipe(read(implementationPath(branch), Implementation), Effect.map(Option.some))
								: Effect.succeed(Option.none<typeof Implementation.Type>())
						),
						Effect.mapError(cause => IssueError.make({cause, message: `failed to read implementation ${branch}`}))
					)
					return IssueEntry.make({
						branch: BranchName.make(branch),
						implementation: Option.getOrUndefined(implementation),
						issue
					})
				}),
				{concurrency: 8}
			)
		})
		const entries = yield* SubscriptionRef.make<readonly (typeof IssueEntry.Type)[]>(yield* load())
		const refresh = Effect.fnUntraced(function* () {
			const next = yield* load()
			const current = yield* SubscriptionRef.get(entries)
			if (!Equal.equals(current, next)) yield* SubscriptionRef.set(entries, next)
		})
		const find = Effect.fnUntraced(function* (branch: typeof BranchName.Type) {
			return yield* pipe(
				yield* SubscriptionRef.get(entries),
				Array.findFirst(entry => entry.branch === branch),
				Option.match({onNone: () => IssueError.make({message: `unknown issue ${branch}`}), onSome: Effect.succeed})
			)
		})
		const hash = Effect.fnUntraced(function* (body: string) {
			return PlanHash.make(Encoding.encodeHex(yield* crypto.digest('SHA-256', decodeBody(body))))
		})
		const mutationFor = Effect.fnUntraced(function* (branch: typeof BranchName.Type) {
			return yield* Ref.modify(mutations, current =>
				Option.match(HashMap.get(current, branch), {
					onNone: () => {
						const semaphore = Semaphore.makeUnsafe(1)
						return [semaphore, HashMap.set(current, branch, semaphore)]
					},
					onSome: semaphore => [semaphore, current]
				})
			)
		})
		function serialized<A, E, R>(branch: typeof BranchName.Type, effect: Effect.Effect<A, E, R>) {
			return pipe(
				mutationFor(branch),
				Effect.flatMap(mutation => Semaphore.withPermit(mutation)(effect))
			)
		}

		return {
			acceptImplementation: Effect.fn('Issues.acceptImplementation')(function acceptImplementation(input: {
				readonly agentId: typeof AgentId.Type
				readonly branch: typeof BranchName.Type
				readonly planHash: typeof PlanHash.Type
			}) {
				return serialized(
					input.branch,
					Effect.gen(function* () {
						const entry = yield* find(input.branch)
						const expected = yield* pipe(currentPlan(entry.issue), Effect.flatMap(hash))
						if (expected !== input.planHash) {
							return yield* IssueError.make({message: 'implementation handoff does not match the current plan'})
						}
						yield* pipe(
							write(
								implementationPath(input.branch),
								Implementation,
								Implementation.make({agentId: input.agentId, planHash: input.planHash})
							),
							Effect.mapError(cause =>
								IssueError.make({cause, message: `failed to save implementation ${input.branch}`})
							)
						)
						yield* refresh()
					})
				)
			}),
			archive: Effect.fn('Issues.archive')(function archive(branch: typeof BranchName.Type) {
				return serialized(
					branch,
					Effect.gen(function* () {
						const entry = yield* find(branch)
						yield* pipe(
							write(
								path.join(config.historyDirectory, branch, 'issue.json'),
								HistoricalIssue,
								HistoricalIssue.make({planIterations: entry.issue.planIterations})
							),
							Effect.andThen(fs.remove(path.join(config.directory, branch), {recursive: true})),
							Effect.mapError(cause => IssueError.make({cause, message: `failed to archive issue ${branch}`}))
						)
						yield* refresh()
					})
				)
			}),
			create: Effect.fn('Issues.create')(function* (input: {
				readonly agentId: typeof AgentId.Type
				readonly plan: string
			}) {
				const suffix = yield* Effect.forEach(
					Array.range(0, 3),
					() =>
						pipe(
							crypto.randomIntBetween(0, branchCharacters.length - 1),
							Effect.map(index => branchCharacters[index] ?? '0')
						),
					{concurrency: 4}
				)
				const branch = BranchName.make(`${semanticSlug(input.plan)}-${Array.join('')(suffix)}`)
				if (yield* fs.exists(issuePath(branch))) {
					return yield* IssueError.make({message: `issue ${branch} already exists`})
				}
				yield* pipe(
					write(issuePath(branch), Issue, Issue.make({agentId: input.agentId, planIterations: [input.plan]})),
					Effect.mapError(cause => IssueError.make({cause, message: `failed to create issue ${branch}`}))
				)
				yield* refresh()
				return branch
			}),
			entries,
			hash,
			history: Effect.fn('Issues.history')(function* () {
				return yield* pipe(
					fs.readDirectory(config.historyDirectory),
					Effect.flatMap(
						Effect.forEach(
							Effect.fnUntraced(function* (branch) {
								const issue = yield* read(path.join(config.historyDirectory, branch, 'issue.json'), HistoricalIssue)
								return ArchivedIssue.make({branch: BranchName.make(branch), planIterations: issue.planIterations})
							}),
							{concurrency: 8}
						)
					),
					Effect.mapError(cause => IssueError.make({cause, message: 'failed to read issue history'}))
				)
			}),
			prepareImplementation: Effect.fn('Issues.prepareImplementation')(function* (branch: typeof BranchName.Type) {
				const entry = yield* find(branch)
				const plan = yield* currentPlan(entry.issue)
				const currentHash = yield* hash(plan)
				if (Predicate.isUndefined(entry.implementation)) {
					return PlanHandoff.make({
						currentHash,
						diff: createTwoFilesPatch('previous.md', 'current.md', '', plan, '', ''),
						plan
					})
				}
				const previous = yield* Effect.findFirst(entry.issue.planIterations, body =>
					pipe(
						hash(body),
						Effect.map(value => value === entry.implementation?.planHash)
					)
				)
				const previousPlan = Option.getOrElse(previous, () => '')
				return PlanHandoff.make({
					currentHash,
					diff: createTwoFilesPatch('previous.md', 'current.md', previousPlan, plan, '', ''),
					plan,
					previousHash: entry.implementation.planHash
				})
			}),
			remove: Effect.fn('Issues.remove')(function remove(branch: typeof BranchName.Type) {
				return serialized(
					branch,
					Effect.gen(function* () {
						yield* find(branch)
						yield* pipe(
							fs.remove(path.join(config.directory, branch), {recursive: true}),
							Effect.mapError(cause => IssueError.make({cause, message: `failed to delete issue ${branch}`}))
						)
						yield* refresh()
					})
				)
			}),
			save: Effect.fn('Issues.save')(function save(input: {
				readonly branch: typeof BranchName.Type
				readonly plan: string
			}) {
				return serialized(
					input.branch,
					Effect.gen(function* () {
						const entry = yield* find(input.branch)
						const current = yield* currentPlan(entry.issue)
						if (current === input.plan) return false
						yield* pipe(
							write(
								issuePath(input.branch),
								Issue,
								Issue.make({
									agentId: entry.issue.agentId,
									planIterations: pipe(entry.issue.planIterations, Array.append(input.plan))
								})
							),
							Effect.mapError(cause => IssueError.make({cause, message: `failed to save issue ${input.branch}`}))
						)
						yield* refresh()
						return true
					})
				)
			})
		}
	})
}) {
	public static layer = (config: Issues.Config) => Layer.effect(this, this.make(config))
}
