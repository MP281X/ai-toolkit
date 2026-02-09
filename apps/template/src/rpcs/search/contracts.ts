import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'
import {SearchError, SearchHistoryEntry, SearchJob, SearchRequest, SearchStreamPart} from './schema.ts'

export class SearchRpcs extends RpcGroup.make(
	Rpc.make('RunSearch', {
		payload: SearchRequest,
		success: SearchStreamPart,
		error: SearchError,
		stream: true
	}),
	Rpc.make('ListHistory', {
		success: Schema.Array(SearchHistoryEntry),
		error: SearchError
	}),
	Rpc.make('ListJobs', {
		success: Schema.Array(SearchJob),
		error: SearchError
	})
).middleware(AuthMiddleware) {}
