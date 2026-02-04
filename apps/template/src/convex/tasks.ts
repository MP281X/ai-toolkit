import {query} from '#convex/server.js'

export const get = query({
	handler: async ctx => {
		return await ctx.db.query('tasks').collect()
	}
})
