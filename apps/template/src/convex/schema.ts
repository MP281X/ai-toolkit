import {authTables} from '@convex-dev/auth/server'
import {defineSchema, defineTable} from 'convex/server'
import {v} from 'convex/values'

export default defineSchema({
	...authTables,
	messages: defineTable({
		userId: v.id('users'),
		providerId: v.string(),
		modelId: v.string(),
		startedAt: v.number(),
		parts: v.array(
			v.union(
				v.object({_tag: v.literal('text-delta'), id: v.string(), text: v.string()}),
				v.object({_tag: v.literal('reasoning-delta'), id: v.string(), text: v.string()}),
				v.object({_tag: v.literal('tool-call'), toolCallId: v.string(), toolName: v.string(), input: v.any()}),
				v.object({
					_tag: v.literal('tool-result'),
					toolCallId: v.string(),
					toolName: v.string(),
					input: v.any(),
					output: v.any()
				}),
				v.object({
					_tag: v.literal('tool-error'),
					toolCallId: v.string(),
					toolName: v.string(),
					input: v.any(),
					error: v.any()
				}),
				v.object({_tag: v.literal('error'), error: v.any()})
			)
		),
		role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
		usage: v.optional(
			v.object({
				inputTokens: v.optional(v.number()),
				outputTokens: v.optional(v.number()),
				totalTokens: v.optional(v.number())
			})
		),
		finishReason: v.optional(
			v.union(
				v.literal('stop'),
				v.literal('length'),
				v.literal('content-filter'),
				v.literal('tool-calls'),
				v.literal('error'),
				v.literal('other')
			)
		)
	}).index('by_userId', ['userId'])
})
