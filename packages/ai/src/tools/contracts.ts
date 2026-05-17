import {Schema, pipe} from 'effect'

import {Tool, Toolkit} from 'effect/unstable/ai'
import {AiError} from 'effect/unstable/ai/AiError'

export const WebSearchToolKit = Toolkit.make(
	Tool.make('web_search', {
		description: 'Search the web for recent, relevant sources and return concise page content snippets.',
		failure: AiError,
		failureMode: 'return',
		parameters: Schema.Struct({
			numResults: pipe(
				Schema.Int,
				Schema.optionalKey,
				Schema.check(Schema.isGreaterThan(0)),
				Schema.annotate({description: 'Optional maximum number of search results to return.'})
			),
			query: Schema.NonEmptyString.annotate({description: 'The search query to send to the web search provider.'})
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
		description: 'Fetch clean text content from specified URLs using Exa.',
		failure: AiError,
		failureMode: 'return',
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
		description: 'Run a shell command through an agent-native command execution tool.',
		failure: AiError,
		failureMode: 'return',
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
		description: 'Apply or report file changes made by an agent-native patch tool.',
		failure: AiError,
		failureMode: 'return',
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
		description: 'Call an MCP server tool through an agent-native MCP bridge.',
		failure: AiError,
		failureMode: 'return',
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
		description: 'Report an agent-native task list update.',
		failure: AiError,
		failureMode: 'return',
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
