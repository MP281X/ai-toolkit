import {Predicate} from 'effect'

import {getAuthUserId} from '@convex-dev/auth/server'

import {query} from '#convex/server.js'

export const list = query({
	handler: async ctx => {
		const userId = await getAuthUserId(ctx)
		if (Predicate.isNullable(userId)) throw new Error('Unauthorized')

		return await ctx.db
			.query('messages')
			.withIndex('by_userId', q => q.eq('userId', userId))
			.order('desc')
			.collect()
	}
})
