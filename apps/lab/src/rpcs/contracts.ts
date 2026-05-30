import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {AgentEvent, AgentKey, AgentStatus} from '@ai-toolkit/ai/schema'

export class RpcContracts extends RpcGroup.make(
	Rpc.make('lab.cwd', {success: Schema.String}),
	Rpc.make('agent.create', {payload: Schema.Struct({agent: AgentId, cwd: Schema.String}), success: AgentKey}),
	Rpc.make('agent.status', {payload: Schema.Struct({key: AgentKey}), stream: true, success: AgentStatus}),
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({key: AgentKey, model: ModelId, prompt: Schema.NonEmptyString, provider: ProviderId})
	}),
	Rpc.make('agent.stop', {payload: Schema.Struct({key: AgentKey})}),
	Rpc.make('agent.events', {payload: Schema.Struct({key: AgentKey}), stream: true, success: AgentEvent})
) {}
