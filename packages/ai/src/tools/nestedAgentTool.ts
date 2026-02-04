import {stepCountIs, ToolLoopAgent, type ToolSet, tool} from 'ai'
import {z} from 'zod'

export type NestedAgentOptions<T extends ToolSet> = {
	name: string
	description: string
	tools: T
	maxSteps: number
	model: ConstructorParameters<typeof ToolLoopAgent>[0]['model']
}

export const makeNestedAgentTool = <T extends ToolSet>(options: NestedAgentOptions<T>) => {
	return tool({
		description: options.description,
		inputSchema: z.object({prompt: z.string()}),
		execute: async input => {
			const agent = new ToolLoopAgent({
				model: options.model,
				tools: options.tools,
				stopWhen: stepCountIs(options.maxSteps)
			})

			const {fullStream} = await agent.stream({prompt: input.prompt})

			return fullStream
		}
	})
}
