import {webSearchTool} from './webSearch.ts'

export type AiGroupId = 'default' | 'web' | 'extreme'

export type AiGroup = {
	instructions: string
	activeTools: 'web_search'[]
}

export const createToolRegistry = () => {
	const tools = {web_search: webSearchTool}
	const groups = {
		default: {
			instructions: 'You are a helpful AI assistant.',
			activeTools: [] as 'web_search'[]
		},
		web: {
			instructions: [
				'You are a research assistant that answers using current web sources.',
				'Run web_search immediately for any question that benefits from up-to-date facts.',
				'Use 3-5 distinct queries with time context in each query.',
				'Return concise answers and cite sources.'
			].join('\n'),
			activeTools: ['web_search']
		},
		extreme: {
			instructions: 'Reserved for a multi-step research agent.',
			activeTools: [] as 'web_search'[]
		}
	} satisfies Record<AiGroupId, AiGroup>

	return {tools, groups}
}
