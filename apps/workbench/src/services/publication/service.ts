import {Array, Context, Effect, Layer, Option, Predicate, String, SubscriptionRef, pipe} from 'effect'

import {PublicationError, PublicationResult} from './schema.ts'

import {BranchName} from '#services/issues/schema.ts'
import type {Issues} from '#services/issues/service.ts'
import type {RepositoryName} from '#services/repositories/schema.ts'
import {Repositories} from '#services/repositories/service.ts'
import type {Git, GitHub} from '@deslop/git/service'
import {filterDiff} from '@deslop/git/service'

function branchTitle(branch: string) {
	return pipe(branch, String.replace(/-[a-z0-9]{4}$/u, ''), String.replace(/-/gu, ' '))
}

function changedAreas(files: readonly {readonly path: string}[]) {
	return pipe(
		files,
		Array.map(file => {
			const parts = String.split('/')(file.path)
			return parts[0] === 'packages' ? `@deslop/${parts[1] ?? 'package'}` : (parts[1] ?? parts[0])
		}),
		Array.dedupe
	)
}

function planTitle(plan: string, branch: string) {
	const heading = /^#\s+(.+)$/mu.exec(plan)?.[1]
	return pipe(
		heading ?? branchTitle(branch),
		String.replace(/^(?:feat|fix|refactor):\s*/iu, ''),
		String.trim,
		String.toLowerCase
	)
}

function planSection(plan: string, heading: 'API' | 'Summary' | 'UI') {
	const lines = String.split(/\r?\n/u)(plan)
	const index = lines.findIndex(line => String.trim(line).toLowerCase() === `## ${heading.toLowerCase()}`)
	if (index < 0) return ''
	return pipe(
		Array.drop(lines, index + 1),
		Array.takeWhile(line => !/^##\s/u.test(String.trim(line))),
		Array.join('\n'),
		String.trim
	)
}

function planOverview(plan: string) {
	const summary = planSection(plan, 'Summary')
	if (summary !== '') return summary
	return pipe(
		plan,
		String.split(/\r?\n/u),
		Array.dropWhile(line => /^#\s/u.test(String.trim(line)) || String.trim(line) === ''),
		Array.takeWhile(line => !/^##\s/u.test(String.trim(line))),
		Array.join('\n'),
		String.trim
	)
}

function changeScope(files: readonly {readonly path: string}[]) {
	const areas = changedAreas(files)
	return Array.isReadonlyArrayEmpty(areas)
		? '- No user-visible files changed.'
		: `- Changed ${files.length} ${files.length === 1 ? 'file' : 'files'} across ${Array.join(', ')(areas)}.`
}

function changeSubject(files: readonly {readonly path: string}[]) {
	const areas = changedAreas(files)
	return Array.isReadonlyArrayEmpty(areas) ? 'publish issue changes' : `update ${Array.join(', ')(areas)}`
}

function conventionalPrefix(
	plan: string,
	files: readonly {readonly path: string; readonly status?: string}[],
	existingTitle?: string
) {
	const existing = /^(feat|fix|refactor):/u.exec(existingTitle ?? '')?.[1]
	if (existing === 'feat' || existing === 'fix' || existing === 'refactor') return existing
	const heading = /^#\s+(fix|bug)(?::|\s)/imu.exec(plan)
	if (Predicate.isNotUndefined(heading)) return 'fix' as const
	if (files.some(file => file.status === 'added' || file.path.endsWith('.tsx') || file.path.endsWith('.css'))) {
		return 'feat' as const
	}
	return 'refactor' as const
}

function sectionBody(plan: string, heading: 'API' | 'Summary' | 'UI', files: readonly {readonly path: string}[]) {
	const planned = heading === 'Summary' ? planOverview(plan) : planSection(plan, heading)
	return planned === '' ? changeScope(files) : `${planned}\n\n${changeScope(files)}`
}

export class Publication extends Context.Service<Publication>()(
	'@deslop/workbench/services/publication/service/Publication',
	{
		make: Effect.fnUntraced(function* () {
			const repositories = yield* Repositories

			return {
				publish: Effect.fn('Publication.publish')(function* (input: {
					readonly base?: typeof BranchName.Type
					readonly branch: typeof BranchName.Type
					readonly git: Git['Service']
					readonly github: GitHub['Service']
					readonly issues: Issues['Service']
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* repositories.find(input.repository)
					const git = input.git
					const github = input.github
					const entry = yield* pipe(
						SubscriptionRef.get(input.issues.entries),
						Effect.flatMap(entries =>
							Option.match(
								Array.findFirst(entries, current => current.branch === input.branch),
								{
									onNone: () => PublicationError.make({message: `unknown issue ${input.branch}`}),
									onSome: Effect.succeed
								}
							)
						)
					)
					const handoff = yield* input.issues.prepareImplementation(input.branch)
					if (Predicate.isUndefined(entry.implementation) || entry.implementation.planHash !== handoff.currentHash) {
						return yield* PublicationError.make({message: 'the current plan has not been delivered to implementation'})
					}
					const existing = Array.findFirst(
						yield* SubscriptionRef.get(github.pullRequests),
						pullRequest => pullRequest.head === input.branch
					)
					const base = pipe(
						existing,
						Option.map(pullRequest => pullRequest.base),
						Option.getOrElse(() => input.base ?? repository.defaultBranch)
					)
					if (
						Option.isNone(existing) &&
						!(yield* repositories.remoteBranchExists({branch: BranchName.make(base), repository: input.repository}))
					) {
						return yield* PublicationError.make({message: `unknown pull request base ${base}`})
					}
					const uncommitted = yield* pipe(
						git.diff({}),
						Effect.mapError(cause => PublicationError.make({cause, message: 'failed to inspect current changes'}))
					)
					const visibleDelta = filterDiff({files: uncommitted})
					const commitPrefix = conventionalPrefix(handoff.plan, visibleDelta)
					const subject = `${commitPrefix}: ${changeSubject(visibleDelta)}`
					const commit = Array.isReadonlyArrayEmpty(uncommitted)
						? undefined
						: yield* pipe(
								git.commit({message: subject}),
								Effect.mapError(cause => PublicationError.make({cause, message: 'failed to commit issue changes'}))
							)
					yield* pipe(
						git.push,
						Effect.mapError(cause => PublicationError.make({cause, message: 'failed to push issue branch'}))
					)
					const complete = filterDiff({
						files: yield* pipe(
							git.diff({base: `origin/${base}`}),
							Effect.mapError(cause =>
								PublicationError.make({cause, message: 'failed to inspect complete branch changes'})
							)
						)
					})
					const ui = Array.some(complete, file => file.path.endsWith('.tsx') || file.path.endsWith('.css'))
					const api = Array.some(
						complete,
						file => String.startsWith('packages/')(file.path) || String.includes('/services/')(file.path)
					)
					const uiFiles = complete.filter(file => file.path.endsWith('.tsx') || file.path.endsWith('.css'))
					const apiFiles = complete.filter(
						file => String.startsWith('packages/')(file.path) || String.includes('/services/')(file.path)
					)
					const prefix = conventionalPrefix(handoff.plan, complete, Option.getOrUndefined(existing)?.title)
					const sections = [
						`## Summary\n\n${sectionBody(handoff.plan, 'Summary', complete)}`,
						...(ui ? [`## UI\n\n${sectionBody(handoff.plan, 'UI', uiFiles)}`] : []),
						...(api ? [`## API\n\n${sectionBody(handoff.plan, 'API', apiFiles)}`] : [])
					]
					const pullRequest = yield* pipe(
						github.publishDraft({
							base,
							body: Array.join('\n\n')(sections),
							branch: input.branch,
							title: `${prefix}: ${planTitle(handoff.plan, input.branch)}`
						}),
						Effect.mapError(cause => PublicationError.make({cause, message: 'failed to publish draft pull request'}))
					)
					return PublicationResult.make({commit, pullRequest})
				})
			}
		})
	}
) {
	public static layer = Layer.effect(this, this.make())
}
