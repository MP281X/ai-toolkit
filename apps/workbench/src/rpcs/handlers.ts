import {Effect, Exit, Stream, SubscriptionRef} from 'effect'

import {AgentRpcContracts, RpcContracts} from './contracts.ts'

import {Repositories} from '#services/repositories/service.ts'
import {WorkbenchError} from '#services/workbench/schema.ts'
import {Workbench} from '#services/workbench/service.ts'
import {AgentUsage} from '@deslop/agent/service'

function failure(message: string) {
	return Effect.mapError((cause: unknown) => WorkbenchError.make({cause, message}))
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const agentUsage = yield* AgentUsage
		const repositories = yield* Repositories
		const workbench = yield* Workbench
		return RpcContracts.of({
			conversation: payload =>
				workbench
					.conversation({...payload, id: payload.agentId})
					.pipe(Stream.mapError(cause => WorkbenchError.make({cause, message: 'failed to load conversation'}))),
			'implementation.prompt': payload =>
				workbench.implementationPrompt(payload).pipe(failure('implementation prompt failed')),
			'implementation.start': payload =>
				Effect.scoped(workbench.startImplementation(payload)).pipe(failure('failed to start implementation')),
			inspector: payload =>
				workbench
					.inspector(payload)
					.pipe(Stream.mapError(cause => WorkbenchError.make({cause, message: 'failed to inspect issue'}))),
			issues: payload =>
				workbench
					.issues(payload.repository)
					.pipe(Stream.mapError(cause => WorkbenchError.make({cause, message: 'failed to load issues'}))),
			'issues.close': payload => workbench.close(payload).pipe(failure('failed to close issue')),
			'issues.savePlan': payload => workbench.savePlan(payload).pipe(failure('failed to save plan')),
			planning: () => SubscriptionRef.changes(workbench.planning),
			'planning.create': payload =>
				Effect.scoped(workbench.createPlanning(payload)).pipe(failure('failed to create planning conversation')),
			'planning.prompt': payload =>
				Effect.scoped(workbench.planningPrompt(payload)).pipe(failure('planning prompt failed')),
			'planning.save': payload => workbench.savePlan(payload).pipe(failure('failed to save plan')),
			'publication.publish': payload =>
				Effect.scoped(workbench.publish(payload)).pipe(failure('failed to publish issue')),
			repositories: () => SubscriptionRef.changes(repositories.repositories),
			'repositories.add': payload => repositories.add(payload).pipe(failure('failed to add repository')),
			usage: () =>
				Stream.fromEffect(SubscriptionRef.get(agentUsage.quota)).pipe(
					Stream.concat(SubscriptionRef.changes(agentUsage.quota)),
					Stream.flatMap(Exit.match({onFailure: Stream.failCause, onSuccess: Stream.succeed}))
				)
		})
	})
)

export const AgentRpcHandlers = AgentRpcContracts.toLayer(
	Effect.gen(function* () {
		const workbench = yield* Workbench
		return AgentRpcContracts.of({
			'agent.assets.upload': payload => workbench.assets.upload(payload).pipe(failure('asset upload failed')),
			'agent.implementation.handoff': payload =>
				workbench.handoff(payload).pipe(failure('failed to prepare implementation')),
			'agent.implementation.start': payload =>
				Effect.scoped(workbench.startImplementation(payload)).pipe(failure('failed to start implementation')),
			'agent.issue.close': payload => workbench.close(payload).pipe(failure('failed to close issue')),
			'agent.issue.history': payload =>
				workbench.history(payload.repository).pipe(failure('failed to load issue history')),
			'agent.issue.savePlan': payload => workbench.savePlan(payload).pipe(failure('failed to save plan')),
			'agent.preview.expose': payload =>
				Effect.gen(function* () {
					const process = yield* workbench.processes.observe(
						workbench.implementationPath(payload.repository, payload.branch),
						payload.script
					)
					return yield* workbench.preview.expose({id: `${payload.repository}-${payload.branch}`, process})
				}).pipe(failure('failed to expose preview')),
			'agent.preview.revoke': payload => workbench.preview.revoke(payload.id),
			'agent.process.start': payload =>
				workbench.processes
					.start({cwd: workbench.implementationPath(payload.repository, payload.branch), script: payload.script})
					.pipe(failure('failed to start process')),
			'agent.process.stop': payload =>
				workbench.processes
					.stop({cwd: workbench.implementationPath(payload.repository, payload.branch), script: payload.script})
					.pipe(failure('failed to stop process')),
			'agent.publication.publish': payload =>
				Effect.scoped(workbench.publish(payload)).pipe(failure('failed to publish issue')),
			'agent.repository.alignDefault': payload =>
				workbench.alignDefault(payload).pipe(failure('failed to align the default branch')),
			'agent.source.add': payload => workbench.addSource(payload).pipe(failure('failed to add source repository')),
			'agent.source.synchronize': payload =>
				workbench.synchronizeSource(payload).pipe(failure('failed to synchronize source repository'))
		})
	})
)
