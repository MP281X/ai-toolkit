import {pipe, Schema} from 'effect'

import {Tool, Toolkit} from 'effect/unstable/ai'
import {AiError} from 'effect/unstable/ai/AiError'

export const WebSearchToolKit = Toolkit.make(
	Tool.make('web_search', {
		failure: AiError,
		failureMode: 'return',
		description: 'Search the web for recent, relevant sources and return concise page content snippets.',
		parameters: Schema.Struct({
			query: Schema.NonEmptyString.annotate({description: 'The search query to send to the web search provider.'}),
			numResults: pipe(
				Schema.Int,
				Schema.optionalKey,
				Schema.check(Schema.isGreaterThan(0)),
				Schema.annotate({description: 'Optional maximum number of search results to return.'})
			)
		}),
		success: Schema.Struct({
			query: Schema.String,
			results: Schema.Array(
				Schema.Struct({
					highlights: Schema.Array(Schema.String),
					text: Schema.String,
					title: Schema.NullOr(Schema.String),
					url: Schema.String
				})
			)
		})
	}).annotate(Tool.Strict, true)
)

export const WebFetchToolKit = Toolkit.make(
	Tool.make('web_fetch', {
		failure: AiError,
		failureMode: 'return',
		description: 'Fetch clean text content from specified URLs using Exa.',
		parameters: Schema.Struct({
			urls: pipe(
				Schema.Array(Schema.URLFromString),
				Schema.check(Schema.isNonEmpty()),
				Schema.annotate({description: 'Array of URLs to fetch content from.'})
			)
		}),
		success: Schema.Struct({
			results: Schema.Array(
				Schema.Struct({
					highlights: Schema.Array(Schema.String),
					text: Schema.String,
					title: Schema.NullOr(Schema.String),
					url: Schema.String
				})
			),
			urls: Schema.Array(Schema.String)
		})
	}).annotate(Tool.Strict, true)
)

export const CommandExecutionToolKit = Toolkit.make(
	Tool.make('command_execution', {
		failure: AiError,
		failureMode: 'return',
		description: 'Run a shell command through an agent-native command execution tool.',
		parameters: Schema.Struct({
			command: Schema.String
		}),
		success: Schema.Struct({
			output: Schema.String
		})
	}).annotate(Tool.Strict, true)
)

export const FileChangeToolKit = Toolkit.make(
	Tool.make('file_change', {
		failure: AiError,
		failureMode: 'return',
		description: 'Apply or report file changes made by an agent-native patch tool.',
		parameters: Schema.Struct({
			changes: Schema.Array(
				Schema.Struct({
					kind: Schema.String,
					path: Schema.String
				})
			)
		}),
		success: Schema.Struct({
			changes: Schema.Array(
				Schema.Struct({
					kind: Schema.String,
					path: Schema.String
				})
			)
		})
	}).annotate(Tool.Strict, true)
)

export const McpToolCallToolKit = Toolkit.make(
	Tool.make('mcp_tool_call', {
		failure: AiError,
		failureMode: 'return',
		description: 'Call an MCP server tool through an agent-native MCP bridge.',
		parameters: Schema.Struct({
			server: Schema.String,
			tool: Schema.String
		}),
		success: Schema.Struct({
			server: Schema.String,
			text: Schema.String,
			tool: Schema.String
		})
	}).annotate(Tool.Strict, true)
)

export const TodoListToolKit = Toolkit.make(
	Tool.make('todo_list', {
		failure: AiError,
		failureMode: 'return',
		description: 'Report an agent-native task list update.',
		parameters: Schema.Struct({
			items: Schema.Array(
				Schema.Struct({
					completed: Schema.Boolean,
					text: Schema.String
				})
			)
		}),
		success: Schema.Struct({
			items: Schema.Array(
				Schema.Struct({
					completed: Schema.Boolean,
					text: Schema.String
				})
			)
		})
	}).annotate(Tool.Strict, true)
)

export const AgentToolKit = Toolkit.merge(
	WebSearchToolKit,
	WebFetchToolKit,
	CommandExecutionToolKit,
	FileChangeToolKit,
	McpToolCallToolKit,
	TodoListToolKit
)
