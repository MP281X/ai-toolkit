import {generateText, NoSuchToolError, Output, type ToolCallRepairFunction, type ToolSet} from 'ai'

export type RepairOptions = {
	repairModel: Parameters<typeof generateText>[0]['model']
}

export const makeRepairToolCall =
	<T extends ToolSet>(options: RepairOptions): ToolCallRepairFunction<T> =>
	async ({toolCall, tools, inputSchema, error}) => {
		if (NoSuchToolError.isInstance(error)) return null

		const tool = tools[toolCall.toolName as keyof typeof tools]
		if (!tool) return null
		if (!('inputSchema' in tool)) return null

		const toolSchema = tool.inputSchema
		const {output: repairedArgs} = await generateText({
			model: options.repairModel,
			output: Output.object({schema: toolSchema}),
			prompt: [
				`The model tried to call the tool "${toolCall.toolName}" with:`,
				JSON.stringify(toolCall.input),
				'The tool schema is:',
				JSON.stringify(inputSchema(toolCall)),
				'Fix the inputs to match the schema.'
			].join('\n')
		})

		return {
			...toolCall,
			input: JSON.stringify(repairedArgs)
		}
	}
