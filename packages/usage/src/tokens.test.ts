import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {Array, Option, Predicate, Schema, pipe} from 'effect'

import {afterEach, describe, expect, it} from 'vite-plus/test'

import {loadUsageTokens} from './tokens.ts'

const roots = Array.empty<string>()

function codexTokenLine(timestamp: string, input: number) {
	return {
		payload: {info: {last_token_usage: {input_tokens: input}, model: 'gpt-5.5'}, type: 'token_count'},
		timestamp,
		type: 'event_msg'
	}
}

function tempRoot() {
	const root = mkdtempSync(join(tmpdir(), 'deslop-usage-'))
	roots.push(root)
	return root
}

function writeJsonl(root: string, path: string, lines: readonly unknown[]) {
	const file = join(root, path)
	mkdirSync(dirname(file), {recursive: true})
	writeFileSync(
		file,
		`${pipe(
			lines,
			Array.map(line => Schema.encodeSync(Schema.UnknownFromJsonString)(line)),
			Array.join('\n')
		)}\n`
	)
}

function load(root: string, now = new Date('2026-06-24T12:00:00.000Z')) {
	return loadUsageTokens({
		env: {CLAUDE_CONFIG_DIR: join(root, 'claude'), CODEX_HOME: join(root, 'codex')},
		home: root,
		now
	})
}

function provider(root: string, name: 'claude' | 'codex') {
	const usage = load(root)
	const result = pipe(
		usage.providers,
		Array.findFirst(item => item.provider === name),
		Option.getOrUndefined
	)
	if (Predicate.isUndefined(result)) throw new Error(`missing ${name} provider`)
	return result
}

function usageTokens(usage: {
	readonly inputTokens: {
		readonly cacheRead?: number
		readonly cacheWrite?: number
		readonly total?: number
		readonly uncached?: number
	}
	readonly outputTokens: {readonly reasoning?: number; readonly text?: number; readonly total?: number}
}) {
	return {
		cacheReadTokens: usage.inputTokens.cacheRead ?? 0,
		cacheWriteTokens: usage.inputTokens.cacheWrite ?? 0,
		inputTokens: usage.inputTokens.total ?? 0,
		outputTokens: usage.outputTokens.total ?? 0,
		reasoningOutputTokens: usage.outputTokens.reasoning ?? 0,
		textOutputTokens: usage.outputTokens.text ?? 0,
		totalTokens: (usage.inputTokens.total ?? 0) + (usage.outputTokens.total ?? 0),
		uncachedInputTokens: usage.inputTokens.uncached ?? 0
	}
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, {force: true, recursive: true})
})

describe('loadUsageTokens Claude parsing', () => {
	it('parses direct Claude usage lines', () => {
		const root = tempRoot()
		writeJsonl(root, 'claude/projects/project/session.jsonl', [
			{
				costUSD: 0.25,
				message: {
					id: 'msg-1',
					model: 'claude-opus-4.8',
					usage: {cache_creation_input_tokens: 20, cache_read_input_tokens: 10, input_tokens: 100, output_tokens: 50}
				},
				requestId: 'req-1',
				timestamp: '2026-06-24T10:00:00.000Z'
			}
		])

		expect(usageTokens(provider(root, 'claude').total.usage)).toMatchObject({
			cacheReadTokens: 10,
			cacheWriteTokens: 20,
			inputTokens: 130,
			outputTokens: 50,
			totalTokens: 180,
			uncachedInputTokens: 100
		})
		expect(provider(root, 'claude').total.modelUsages).toMatchObject([{model: 'claude-opus-4.8'}])
	})

	it('parses nested agent-progress Claude usage lines', () => {
		const root = tempRoot()
		writeJsonl(root, 'claude/projects/project/session/agent.jsonl', [
			{
				data: {
					message: {
						message: {id: 'msg-1', model: 'claude-opus-4.8', usage: {input_tokens: 100, output_tokens: 50}},
						requestId: 'req-1',
						timestamp: '2026-06-24T10:00:00.000Z'
					}
				}
			}
		])

		expect(usageTokens(provider(root, 'claude').total.usage)).toMatchObject({inputTokens: 100, outputTokens: 50})
	})

	it('prefers non-sidechain Claude entries during message dedupe', () => {
		const root = tempRoot()
		writeJsonl(root, 'claude/projects/project/session.jsonl', [
			{
				message: {id: 'msg-1', model: 'claude-opus-4.8', usage: {input_tokens: 10, output_tokens: 10}},
				requestId: 'parent',
				timestamp: '2026-06-24T10:00:00.000Z'
			},
			{
				isSidechain: true,
				message: {id: 'msg-1', model: 'claude-opus-4.8', usage: {input_tokens: 500, output_tokens: 500}},
				requestId: 'side',
				timestamp: '2026-06-24T10:01:00.000Z'
			}
		])

		expect(usageTokens(provider(root, 'claude').total.usage)).toMatchObject({inputTokens: 10, outputTokens: 10})
	})
})

describe('loadUsageTokens Codex parsing', () => {
	it('parses Codex cumulative token deltas', () => {
		const root = tempRoot()
		writeJsonl(root, 'codex/sessions/session.jsonl', [
			{payload: {model: 'gpt-5.5'}, timestamp: '2026-06-24T09:00:00.000Z', type: 'turn_context'},
			{
				payload: {
					info: {total_token_usage: {cached_input_tokens: 10, input_tokens: 100, output_tokens: 50, total_tokens: 150}},
					type: 'token_count'
				},
				timestamp: '2026-06-24T09:01:00.000Z',
				type: 'event_msg'
			},
			{
				payload: {
					info: {total_token_usage: {cached_input_tokens: 40, input_tokens: 250, output_tokens: 90, total_tokens: 340}},
					type: 'token_count'
				},
				timestamp: '2026-06-24T09:02:00.000Z',
				type: 'event_msg'
			}
		])

		expect(usageTokens(provider(root, 'codex').total.usage)).toMatchObject({
			cacheReadTokens: 40,
			inputTokens: 250,
			outputTokens: 90,
			totalTokens: 340
		})
	})

	it('parses Codex last_token_usage events', () => {
		const root = tempRoot()
		writeJsonl(root, 'codex/sessions/session.jsonl', [
			{
				payload: {
					info: {
						last_token_usage: {
							cached_input_tokens: 10,
							input_tokens: 100,
							output_tokens: 50,
							reasoning_output_tokens: 5,
							total_tokens: 155
						},
						model: 'gpt-5.5'
					},
					type: 'token_count'
				},
				timestamp: '2026-06-24T09:01:00.000Z',
				type: 'event_msg'
			}
		])

		expect(usageTokens(provider(root, 'codex').total.usage)).toMatchObject({
			inputTokens: 100,
			outputTokens: 55,
			reasoningOutputTokens: 5,
			totalTokens: 155
		})
	})

	it('parses Codex headless usage aliases', () => {
		const root = tempRoot()
		writeJsonl(root, 'codex/sessions/run.jsonl', [
			{
				data: {
					model_name: 'gpt-5.5',
					timestamp: '2026-06-24T09:01:00.000Z',
					usage: {cached_tokens: 10, completion_tokens: 50, prompt_tokens: 100}
				},
				type: 'result'
			}
		])

		expect(usageTokens(provider(root, 'codex').total.usage)).toMatchObject({
			cacheReadTokens: 10,
			inputTokens: 100,
			outputTokens: 50
		})
	})

	it('keeps active Codex files over archived files with the same relative path', () => {
		const root = tempRoot()
		writeJsonl(root, 'codex/sessions/session.jsonl', [codexTokenLine('2026-06-24T09:01:00.000Z', 100)])
		writeJsonl(root, 'codex/archived_sessions/session.jsonl', [codexTokenLine('2026-06-24T09:01:00.000Z', 999)])
		writeJsonl(root, 'codex/archived_sessions/archive-only.jsonl', [codexTokenLine('2026-06-24T09:01:00.000Z', 50)])

		expect(usageTokens(provider(root, 'codex').total.usage).inputTokens).toBe(150)
	})

	it('aggregates today, month, total, and model usages with a fixed clock', () => {
		const root = tempRoot()
		writeJsonl(root, 'codex/sessions/session.jsonl', [
			codexTokenLine('2026-06-24T09:01:00.000Z', 100),
			codexTokenLine('2026-06-01T09:01:00.000Z', 50),
			codexTokenLine('2026-05-31T09:01:00.000Z', 25)
		])

		const codex = provider(root, 'codex')
		expect(usageTokens(codex.today.usage).inputTokens).toBe(100)
		expect(usageTokens(codex.month.usage).inputTokens).toBe(150)
		expect(usageTokens(codex.total.usage).inputTokens).toBe(175)
		expect(codex.total.modelUsages).toHaveLength(1)
		expect(usageTokens(codex.total.modelUsages[0]!.usage).inputTokens).toBe(175)
	})
})
