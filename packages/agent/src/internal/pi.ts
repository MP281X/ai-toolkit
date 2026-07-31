import {
	Array,
	Context,
	Deferred,
	Effect,
	Encoding,
	Option,
	Predicate,
	Record,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import type {ImageContent, TextContent} from '@earendil-works/pi-ai'
import {OPENAI_CODEX_MODELS} from '@earendil-works/pi-ai/providers/openai-codex.models'
import {
	DefaultResourceLoader,
	SessionManager,
	createAgentSession,
	getAgentDir,
	type AgentSessionEvent,
	type AgentToolResult,
	type AgentToolUpdateCallback,
	type ExtensionContext,
	type ToolDefinition
} from '@earendil-works/pi-coding-agent'
import {Prompt, Tool, Toolkit} from 'effect/unstable/ai'

import {AgentError} from '../schema.ts'
import type {Agent} from '../service.ts'

function imageDataFromFilePart(part: Prompt.FilePart) {
	if (part.data instanceof URL) return
	if (!Predicate.isString(part.data)) return Encoding.encodeBase64(part.data)
	const prefix = `data:${part.mediaType};base64,`
	return String.startsWith(prefix)(part.data) ? String.slice(String.length(prefix))(part.data) : part.data
}

const piContent = Effect.fnUntraced(function* (message: Prompt.UserMessage) {
	const content: (TextContent | ImageContent)[] = []
	for (const part of message.content) {
		if (part.type === 'text') {
			content.push({text: part.text, type: 'text'})
			continue
		}
		if (!String.startsWith('image/')(part.mediaType)) continue
		const data = imageDataFromFilePart(part)
		if (Predicate.isUndefined(data)) return yield* AgentError.make({message: 'Pi cannot read URL image prompt parts'})
		content.push({data, mimeType: part.mediaType, type: 'image'})
	}
	return content
})

function textResult(result: unknown) {
	if (Predicate.isString(result)) return result
	if (Predicate.isUndefined(result)) return 'undefined'
	return Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(result)
}

function toolResult(result?: unknown) {
	return {content: [{text: textResult(result), type: 'text'}], details: result} satisfies AgentToolResult<unknown>
}

function toolsFromToolkit<ToolSet extends Record<string, Tool.Any>>(
	toolkit: Toolkit.WithHandler<ToolSet>,
	context: Context.Context<unknown>
) {
	return pipe(
		Record.keys(toolkit.tools),
		Array.map(name => {
			const tool = toolkit.tools[name]
			if (Predicate.isUndefined(tool)) throw new Error(`unknown tool ${name}`)
			return {
				description: Predicate.isString(tool.description) ? tool.description : name,
				execute: async (
					_toolCallId: string,
					params: Tool.Parameters<ToolSet[string]>,
					_signal: AbortSignal | undefined,
					onUpdate: AgentToolUpdateCallback<unknown> | undefined,
					_ctx: ExtensionContext
				) => {
					const final = await Effect.runPromise(
						pipe(
							toolkit.handle(name, params),
							Effect.flatMap(stream =>
								Stream.runFold<Tool.HandlerResult<ToolSet[string]> | undefined, Tool.HandlerResult<ToolSet[string]>>(
									() => {},
									(current, result) => {
										if (result.preliminary) {
											onUpdate?.(toolResult(result.encodedResult))
											return current
										}
										return result
									}
								)(stream)
							),
							Effect.provideContext(context)
						)
					)
					if (Predicate.isUndefined(final)) return toolResult()
					if (final.isFailure) throw final.encodedResult
					return toolResult(final.encodedResult)
				},
				label: name,
				name,
				parameters: Tool.getJsonSchema(tool)
			} satisfies ToolDefinition
		})
	)
}

function messageText(content: string | readonly (TextContent | ImageContent)[]) {
	return Predicate.isString(content)
		? content
		: pipe(
				content,
				Array.filter(part => part.type === 'text'),
				Array.map(part => part.text),
				Array.join('\n')
			)
}

function promptMessage(
	message: ReturnType<SessionManager['buildSessionContext']>['messages'][number]
): Prompt.Message | undefined {
	if (message.role === 'user') {
		return Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: messageText(message.content)})]})
	}
	if (message.role === 'toolResult') {
		return Prompt.makeMessage('tool', {
			content: [
				Prompt.makePart('tool-result', {
					id: message.toolCallId,
					isFailure: message.isError,
					name: message.toolName,
					result: messageText(message.content)
				})
			]
		})
	}
	if (message.role !== 'assistant') return
	const content = pipe(
		message.content,
		Array.map(part => {
			if (part.type === 'thinking') return Prompt.makePart('reasoning', {text: part.thinking})
			if (part.type === 'toolCall') {
				return Prompt.makePart('tool-call', {
					id: part.id,
					name: part.name,
					params: part.arguments,
					providerExecuted: false
				})
			}
			return Prompt.makePart('text', {text: part.text})
		})
	)
	return Prompt.makeMessage('assistant', {content})
}

function assistant(messages: readonly Prompt.Message[]) {
	return pipe(
		messages,
		Array.findLast(message => message.role === 'assistant'),
		Option.match({
			onNone: () => AgentError.make({message: 'Pi completed without an assistant message'}),
			onSome: Effect.succeed
		})
	)
}

const readOnlyGit =
	/^(?:status|diff|log|show|rev-parse|merge-base|ls-files|ls-tree|cat-file|for-each-ref|describe|name-rev|shortlog|blame|grep)\b/u
const readOnlyGh =
	/^(?:issue\s+(?:list|view)|pr\s+(?:list|view|diff|checks|status)|run\s+(?:list|view)|repo\s+view|release\s+(?:list|view))\b/u
const readOnlyGitRemote = /^remote(?:\s+(?:-v|show|get-url)(?:\s|$)|\s*$)/u

function subcommand(program: string, value: string) {
	const words = String.split(/\s+/u)(String.trim(value))
	let index = 0
	while (index < words.length && String.startsWith('-')(words[index] ?? '')) {
		const option = words[index] ?? ''
		if (program === 'git' && (option === '-c' || String.startsWith('--config-env')(option))) return
		const consumesValue =
			(program === 'git' && ['-C', '--git-dir', '--namespace', '--super-prefix', '--work-tree'].includes(option)) ||
			(program === 'gh' && ['-R', '--config', '--hostname', '--repo'].includes(option))
		index += consumesValue && !String.includes('=')(option) ? 2 : 1
	}
	return Array.join(' ')(Array.drop(words, index))
}

export function mutationReason(command: string): Option.Option<string> {
	const normalized = command.replace(/\\(.)/gu, '$1').replace(/['"]/gu, '')
	if (/`|\$\(/u.test(normalized)) {
		return Option.some('Shell substitutions are disabled; use direct read-only commands or code-mode')
	}
	if (/(?:^|[;&|]\s*)[^\s;&|]*[*?[\]][^\s;&|]*(?:\s|$)/u.test(normalized)) {
		return Option.some('Dynamic executable expansion is disabled; use direct read-only commands or code-mode')
	}
	if (
		/(?:^|[;&|]\s*)(?:(?:env|command)\s+)*(?:(?:\/[^\s;&|]+\/)?(?:ba|da|z)?sh)(?:\s|$)|\b(?:node|python[0-9.]*|perl|ruby)\s+(?:-[^\s]*[ce]\b|--eval\b)/u.test(
			normalized
		)
	) {
		return Option.some('Nested interpreters are disabled; use direct commands or code-mode')
	}
	if (/(?:^|[;&|]\s*)(?:source|\.)\s+/u.test(normalized)) {
		return Option.some('Script indirection is disabled; use direct commands or code-mode')
	}
	for (const match of normalized.matchAll(/(?:^|[;&|]\s*)(\/\S+|\.{1,2}\/\S+)/gu)) {
		const path = match[1] ?? ''
		if (!/(?:^|\/)(?:git|gh)$/u.test(path)) {
			return Option.some('Script indirection is disabled; use direct commands or code-mode')
		}
	}
	if (/\S\$\([^)]*\)\S/gu.test(normalized)) {
		return Option.some('Dynamic executable construction is disabled; use direct read-only commands or code-mode')
	}
	if (/\S\$\{[^}]*\}\S/gu.test(normalized)) {
		return Option.some('Dynamic executable construction is disabled; use direct read-only commands or code-mode')
	}
	if (/(?:^|[;&|]\s*)(?:[A-Za-z_][A-Za-z0-9_]*=|\$[A-Za-z_{]|\$\()/u.test(normalized)) {
		return Option.some('Dynamic shell execution is disabled; use direct read-only commands or code-mode')
	}
	if (/(?:^|[\s;&|])eval(?:\s|$)/u.test(normalized)) {
		return Option.some('Dynamic shell execution is disabled; use direct read-only commands or code-mode')
	}
	const executable =
		/(?:^|[\s;&|('"])(?:(?:builtin|command|env|sudo)\s+(?:(?:-[^\s]+|[A-Za-z_][A-Za-z0-9_]*=[^\s]+)\s+)*)?(?:\/[^\s;&|()'"]*\/)?(git|gh)\s+([^;&|)]+)/gu
	for (const match of normalized.matchAll(executable)) {
		const program = match[1]
		const args = subcommand(program ?? '', match[2] ?? '')
		if (Predicate.isUndefined(args)) return Option.some('Git mutations must use code-mode')
		if (program === 'git' && !readOnlyGit.test(args) && !readOnlyGitRemote.test(args)) {
			return Option.some('Git mutations must use code-mode')
		}
		if (program === 'gh' && !readOnlyGh.test(args)) return Option.some('GitHub mutations must use code-mode')
	}
	return Option.none<string>()
}

function reasoning(value: string) {
	return pipe(
		Schema.decodeUnknownOption(Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const))(value),
		Option.getOrElse(() => 'medium' as const)
	)
}

export const makePi = Effect.fnUntraced(function* (config: Agent.Config) {
	const sessionManager = yield* Effect.tryPromise({
		catch: cause => AgentError.make({cause, message: 'failed to open Pi session'}),
		try: async () => {
			if (Predicate.isUndefined(config.id)) return SessionManager.create(config.cwd, config.sessionDirectory)
			const sessions = await SessionManager.listAll(config.sessionDirectory)
			const found = sessions.find(session => session.id === config.id)
			if (Predicate.isUndefined(found)) throw new Error(`unknown Pi session ${config.id}`)
			return SessionManager.open(found.path, config.sessionDirectory, config.cwd)
		}
	})
	const model = pipe(
		Record.keys(OPENAI_CODEX_MODELS),
		Array.findFirst(id => id === config.model),
		Option.map(id => OPENAI_CODEX_MODELS[id]),
		Option.getOrUndefined
	)
	if (Predicate.isUndefined(model)) return yield* AgentError.make({message: `unknown Pi model ${config.model}`})
	const handledToolkit = yield* Toolkit.make(...Record.values(config.toolkit.tools))
	const handlerContext = Context.makeUnsafe<unknown>((yield* Effect.context()).mapUnsafe)
	const resourceLoader = new DefaultResourceLoader({
		agentDir: getAgentDir(),
		cwd: config.cwd,
		extensionFactories: [
			pi => {
				pi.on('tool_call', event => {
					if (event.toolName !== 'bash') return
					const command = event.input['command']
					if (!Predicate.isString(command)) return
					const reason = mutationReason(command)
					return Option.match(reason, {onNone: () => {}, onSome: value => ({block: true, reason: value})})
				})
			}
		],
		systemPrompt: config.systemPrompt
	})
	yield* Effect.tryPromise({
		catch: cause => AgentError.make({cause, message: 'failed to load Pi resources'}),
		try: () => resourceLoader.reload()
	})
	const result = yield* Effect.tryPromise({
		catch: cause => AgentError.make({cause, message: 'failed to create Pi agent'}),
		try: () =>
			createAgentSession({
				customTools: toolsFromToolkit(handledToolkit, handlerContext),
				cwd: config.cwd,
				model,
				resourceLoader,
				sessionManager,
				thinkingLevel: reasoning(config.reasoningEffort)
			})
	})
	yield* Effect.addFinalizer(() =>
		Effect.sync(() => {
			result.session.dispose()
		})
	)

	function currentHistory() {
		const messages: Prompt.Message[] = []
		for (const message of result.session.messages) {
			const converted = promptMessage(message)
			if (Predicate.isNotUndefined(converted)) messages.push(converted)
		}
		return messages
	}
	const history = yield* SubscriptionRef.make<readonly Prompt.Message[]>(currentHistory())
	const status = yield* SubscriptionRef.make<'idle' | 'running' | 'retrying'>('idle')
	const refresh = SubscriptionRef.set(history, currentHistory())
	const unsubscribe = result.session.subscribe(event => {
		Effect.runForkWith(handlerContext)(
			Effect.gen(function* () {
				if (event.type === 'auto_retry_start') yield* SubscriptionRef.set(status, 'retrying')
				if (event.type === 'agent_start') yield* SubscriptionRef.set(status, 'running')
				if (event.type === 'message_end') yield* refresh
				if (event.type === 'agent_end' && !event.willRetry) {
					yield* refresh
					yield* SubscriptionRef.set(status, 'idle')
				}
			})
		)
	})
	yield* Effect.addFinalizer(() => Effect.sync(unsubscribe))

	const prompt = Effect.fn('Agent.prompt')(function* (message: Prompt.UserMessage) {
		const completion = yield* Deferred.make<Prompt.AssistantMessage, AgentError>()
		const wait = result.session.subscribe((event: AgentSessionEvent) => {
			if (event.type !== 'agent_end' || event.willRetry) return
			Effect.runForkWith(handlerContext)(
				pipe(
					refresh,
					Effect.andThen(SubscriptionRef.get(history)),
					Effect.flatMap(assistant),
					Effect.flatMap(value => Deferred.succeed(completion, value)),
					Effect.catch(error => Deferred.fail(completion, error))
				)
			)
		})
		yield* Effect.addFinalizer(() => Effect.sync(wait))
		const content = yield* piContent(message)
		yield* pipe(
			Effect.tryPromise({
				catch: cause => AgentError.make({cause, message: 'Pi prompt failed'}),
				try: () =>
					result.session.sendUserMessage(content, {deliverAs: result.session.isStreaming ? 'followUp' : undefined})
			}),
			Effect.tap(() => SubscriptionRef.set(status, 'running'))
		)
		return yield* Deferred.await(completion)
	})

	return {
		history,
		id: result.session.sessionId,
		prompt: (message: Prompt.UserMessage) => Effect.scoped(prompt(message)),
		status,
		steer: Effect.fn('Agent.steer')(function* (message: Prompt.UserMessage) {
			if (!result.session.isStreaming) return yield* AgentError.make({message: 'cannot steer an idle agent'})
			const content = yield* piContent(message)
			yield* Effect.tryPromise({
				catch: cause => AgentError.make({cause, message: 'Pi steer failed'}),
				try: () => result.session.sendUserMessage(content, {deliverAs: 'steer'})
			})
			return void 0
		})
	}
})
