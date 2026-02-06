import {authTables} from '@convex-dev/auth/server'
import {defineSchema, defineTable} from 'convex/server'
import {v} from 'convex/values'

export default defineSchema({
	...authTables,
	messages: defineTable({
		userId: v.id('users'),
		model: v.object({
			provider: v.union(v.literal('opencode_zen')),
			model: v.union(v.literal('glm-4.7-free'), v.literal('kimi-k2.5-free'), v.literal('minimax-m2.1-free'))
		}),
		startedAt: v.number(),
		role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
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
		usage: v.optional(
			v.object({
				input: v.number(),
				output: v.number(),
				reasoning: v.number()
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
