import {Array, Match, Option, Predicate, Schema, pipe} from 'effect'

const AgentBrowserFrameMetadata = Schema.Struct({
	deviceHeight: Schema.optional(Schema.Number),
	deviceWidth: Schema.optional(Schema.Number),
	offsetTop: Schema.optional(Schema.Number),
	pageScaleFactor: Schema.optional(Schema.Number),
	scrollOffsetX: Schema.optional(Schema.Number),
	scrollOffsetY: Schema.optional(Schema.Number)
})

const AgentBrowserFrame = Schema.Struct({
	data: Schema.String,
	metadata: Schema.optional(AgentBrowserFrameMetadata),
	type: Schema.Literal('frame')
})

type AgentBrowserTab = typeof AgentBrowserTab.Type
const AgentBrowserTab = Schema.Struct({
	id: Schema.optional(Schema.String),
	title: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String)
})

const AgentBrowserStreamMessage = Schema.Union([
	AgentBrowserFrame,
	Schema.Struct({status: Schema.Unknown, type: Schema.Literal('status')}),
	Schema.Struct({tabs: Schema.Array(AgentBrowserTab), type: Schema.Literal('tabs')}),
	Schema.Struct({
		level: Schema.optional(Schema.String),
		message: Schema.optional(Schema.String),
		text: Schema.optional(Schema.String),
		type: Schema.Literal('console')
	}),
	Schema.Struct({result: Schema.Unknown, type: Schema.Literal('result')})
])

export type AgentBrowserStreamState = typeof AgentBrowserStreamState.Type
const AgentBrowserStreamState = Schema.Struct({
	console: Schema.Array(Schema.Struct({level: Schema.String, message: Schema.String})),
	frame: Schema.optional(AgentBrowserFrame),
	result: Schema.optional(Schema.String),
	status: Schema.optional(Schema.String),
	tabs: Schema.Array(AgentBrowserTab)
})

export function initialAgentBrowserStreamState() {
	return AgentBrowserStreamState.make({console: [], tabs: []})
}

function text(value: unknown) {
	if (Predicate.isString(value)) return value
	if (Predicate.isUndefined(value)) return ''
	return Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(value)
}

export function reduceAgentBrowserStreamMessage(state: AgentBrowserStreamState, source: unknown) {
	const message = pipe(Schema.decodeUnknownOption(AgentBrowserStreamMessage)(source), Option.getOrUndefined)
	if (Predicate.isUndefined(message)) return state

	return pipe(
		Match.value(message),
		Match.when({type: 'frame'}, frame => ({...state, frame})),
		Match.when({type: 'tabs'}, tabs => ({...state, tabs: tabs.tabs})),
		Match.when({type: 'status'}, status => ({...state, status: text(status.status)})),
		Match.when({type: 'result'}, result => ({...state, result: text(result.result)})),
		Match.when({type: 'console'}, log => ({
			...state,
			console: pipe(
				state.console,
				Array.append({level: log.level ?? 'log', message: log.message ?? log.text ?? ''}),
				Array.takeRight(200)
			)
		})),
		Match.exhaustive
	)
}
