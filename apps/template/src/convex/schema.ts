import {authTables} from '@convex-dev/auth/server'
import {defineSchema, defineTable} from 'convex/server'
import {v} from 'convex/values'

export default defineSchema({
	...authTables,
	messages: defineTable({
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
				v.object({
					_tag: v.literal('finish'),
					finishReason: v.string(),
					totalUsage: v.object({
						inputTokens: v.optional(v.number()),
						outputTokens: v.optional(v.number()),
						totalTokens: v.optional(v.number()),
						inputTokenDetails: v.object({
							cacheReadTokens: v.optional(v.number()),
							cacheWriteTokens: v.optional(v.number())
						}),
						outputTokenDetails: v.object({
							reasoningTokens: v.optional(v.number())
						})
					})
				}),
				v.object({_tag: v.literal('error'), error: v.any()})
			)
		),
		role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system'))
	})
})
