import {Effect, Predicate, Stream} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from './atomRuntime.ts'

import {AgentId, BranchName} from '#services/issues/schema.ts'
import {RepositoryName} from '#services/repositories/schema.ts'

export const repositoriesAtom = Atom.keepAlive(
	RpcClient.runtime.atom(Effect.map(RpcClient, client => client('repositories', void 0)).pipe(Stream.unwrap), {
		initialValue: []
	})
)

export const usageAtom = Atom.keepAlive(
	RpcClient.runtime.atom(Effect.map(RpcClient, client => client('usage', void 0)).pipe(Stream.unwrap))
)

export const planningAtom = Atom.keepAlive(
	RpcClient.runtime.atom(Effect.map(RpcClient, client => client('planning', void 0)).pipe(Stream.unwrap), {
		initialValue: []
	})
)

export const issuesAtom = Atom.family((repository: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			repository === ''
				? Stream.succeed([])
				: Effect.map(RpcClient, client => client('issues', {repository: RepositoryName.make(repository)})).pipe(
						Stream.unwrap
					),
			{initialValue: []}
		)
	)
)

export const inspectorAtom = Atom.family((key: string) => {
	const [repository = '', branch = ''] = key.split('\u0000')
	return RpcClient.runtime.atom(
		Effect.map(RpcClient, client =>
			client('inspector', {branch: BranchName.make(branch), repository: RepositoryName.make(repository)})
		).pipe(Stream.unwrap)
	)
})

export const conversationAtom = Atom.family((key: string) => {
	const [repository = '', agentId = '', branch] = key.split('\u0000')
	return RpcClient.runtime.atom(
		Effect.map(RpcClient, client =>
			client('conversation', {
				agentId: AgentId.make(agentId),
				branch: Predicate.isUndefined(branch) || branch === '' ? undefined : BranchName.make(branch),
				repository: RepositoryName.make(repository)
			})
		).pipe(Stream.unwrap)
	)
})
