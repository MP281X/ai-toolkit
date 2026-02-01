import {query} from '#convex/server.js'

export const get = query({
	args: {},
	handler: async ctx => {
		return await ctx.db.query('tasks').collect()
	}
})
