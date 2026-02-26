import {Effect} from 'effect'

import {type ToolSet, tool} from 'ai'
import {z} from 'zod'

export const questionToolSet = Effect.succeed({
	question: tool({
		description: 'Ask the user a list of questions and collect responses.',
		inputSchema: z.object({
			questions: z
				.array(
					z.object({
						header: z.string().min(1),
						question: z.string().min(1),
						options: z
							.array(
								z.object({
									label: z.string().min(1),
									description: z.string().optional()
								})
							)
							.optional(),
						multiple: z.boolean().optional()
					})
				)
				.min(1)
		})
	})
} satisfies ToolSet)
