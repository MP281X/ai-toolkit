/* eslint-disable */
/* oxlint-disable */

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {homedir} from 'node:os'
import {join, relative} from 'node:path'

import {Response} from 'effect/unstable/ai'

import {UsageTokenProvider, UsageTokens} from './schema.ts'

type Provider = 'claude' | 'codex'

type LogUsage = {
	cacheCreationTokens: number
	cacheReadTokens: number
	inputTokens: number
	outputTokens: number
	reasoningOutputTokens: number
	totalTokens: number
}

type UsageEvent = {model?: string; provider: Provider; timestamp: string; usage: Response.Usage}

type ClaudeEvent = UsageEvent & {isSidechain?: boolean; messageId?: string; requestId?: string}
type FileCacheEntry = {events: readonly UsageEvent[]; mtimeMs: number; path: string; size: number}

export type LoadUsageTokensOptions = {
	readonly env?: Record<string, string | undefined>
	readonly home?: string
	readonly now?: Date
}

function zeroUsage() {
	return new Response.Usage({
		inputTokens: {cacheRead: 0, cacheWrite: 0, total: 0, uncached: 0},
		outputTokens: {reasoning: 0, text: 0, total: 0}
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberField(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
	}
	return undefined
}

function stringField(value: unknown) {
	return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function boolField(value: unknown) {
	return typeof value === 'boolean' ? value : undefined
}

function recordField(value: unknown, key: string) {
	return isRecord(value) ? value[key] : undefined
}

function firstRecord(value: unknown, keys: readonly string[]) {
	for (const key of keys) {
		const field = recordField(value, key)
		if (isRecord(field)) return field
	}
	return undefined
}

function firstString(value: unknown, keys: readonly string[]) {
	for (const key of keys) {
		const field = stringField(recordField(value, key))
		if (field !== undefined) return field
	}
	return undefined
}

function firstNumber(value: unknown, keys: readonly string[]) {
	for (const key of keys) {
		const field = numberField(recordField(value, key))
		if (field !== undefined) return field
	}
	return undefined
}

function claudeUsage(usage: LogUsage) {
	const outputTotal = usage.outputTokens + usage.reasoningOutputTokens
	const inputTotal = usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens

	return new Response.Usage({
		inputTokens: {
			cacheRead: usage.cacheReadTokens,
			cacheWrite: usage.cacheCreationTokens,
			total: inputTotal,
			uncached: usage.inputTokens
		},
		outputTokens: {reasoning: usage.reasoningOutputTokens, text: usage.outputTokens, total: outputTotal}
	})
}

function codexUsage(usage: LogUsage) {
	const outputTotal = usage.outputTokens + usage.reasoningOutputTokens
	const inputTotal = usage.inputTokens

	return new Response.Usage({
		inputTokens: {
			cacheRead: usage.cacheReadTokens,
			cacheWrite: usage.cacheCreationTokens,
			total: inputTotal,
			uncached: Math.max(inputTotal - usage.cacheReadTokens - usage.cacheCreationTokens, 0)
		},
		outputTokens: {reasoning: usage.reasoningOutputTokens, text: usage.outputTokens, total: outputTotal}
	})
}

function tokenUsage(usage: Response.Usage): LogUsage {
	return {
		cacheCreationTokens: usage.inputTokens.cacheWrite ?? 0,
		cacheReadTokens: usage.inputTokens.cacheRead ?? 0,
		inputTokens: usage.inputTokens.total ?? 0,
		outputTokens: usage.outputTokens.text ?? 0,
		reasoningOutputTokens: usage.outputTokens.reasoning ?? 0,
		totalTokens: (usage.inputTokens.total ?? 0) + (usage.outputTokens.total ?? 0)
	}
}

function logUsage(value: unknown): LogUsage | undefined {
	if (!isRecord(value)) return undefined
	const cacheCreation = firstRecord(value, ['cache_creation', 'cacheCreation'])
	const cacheCreationTokens = isRecord(cacheCreation)
		? (firstNumber(cacheCreation, ['ephemeral_5m_input_tokens', 'ephemeral5mInputTokens']) ?? 0) +
			(firstNumber(cacheCreation, ['ephemeral_1h_input_tokens', 'ephemeral1hInputTokens']) ?? 0)
		: (firstNumber(value, ['cache_creation_input_tokens', 'cacheCreationInputTokens']) ?? 0)
	const usage = {
		cacheCreationTokens,
		cacheReadTokens:
			firstNumber(value, ['cache_read_input_tokens', 'cached_input_tokens', 'cached_tokens', 'cacheReadInputTokens']) ??
			0,
		inputTokens: firstNumber(value, ['input_tokens', 'prompt_tokens', 'inputTokens', 'input']) ?? 0,
		outputTokens: firstNumber(value, ['output_tokens', 'completion_tokens', 'outputTokens', 'output']) ?? 0,
		reasoningOutputTokens:
			firstNumber(value, ['reasoning_output_tokens', 'reasoning_tokens', 'reasoningOutputTokens']) ?? 0
	}
	const totalTokens =
		firstNumber(value, ['total_tokens', 'totalTokens']) ??
		usage.inputTokens +
			usage.outputTokens +
			usage.reasoningOutputTokens +
			usage.cacheCreationTokens +
			usage.cacheReadTokens
	if (
		usage.inputTokens === 0 &&
		usage.outputTokens === 0 &&
		usage.reasoningOutputTokens === 0 &&
		usage.cacheCreationTokens === 0 &&
		usage.cacheReadTokens === 0 &&
		totalTokens === 0
	) {
		return undefined
	}
	return {...usage, cacheReadTokens: Math.min(usage.cacheReadTokens, usage.inputTokens), totalTokens}
}

function usageDelta(current: LogUsage, previous: LogUsage | undefined): LogUsage {
	if (previous === undefined) return current
	return {
		cacheCreationTokens: Math.max(current.cacheCreationTokens - previous.cacheCreationTokens, 0),
		cacheReadTokens: Math.max(current.cacheReadTokens - previous.cacheReadTokens, 0),
		inputTokens: Math.max(current.inputTokens - previous.inputTokens, 0),
		outputTokens: Math.max(current.outputTokens - previous.outputTokens, 0),
		reasoningOutputTokens: Math.max(current.reasoningOutputTokens - previous.reasoningOutputTokens, 0),
		totalTokens: Math.max(current.totalTokens - previous.totalTokens, 0)
	}
}

function parseLine(line: string) {
	try {
		return JSON.parse(line) as unknown
	} catch {
		return undefined
	}
}

function parseClaudePayload(value: unknown): ClaudeEvent | undefined {
	const nested = firstRecord(firstRecord(value, ['data']), ['message'])
	const entry = nested ?? value
	if (!isRecord(entry)) return undefined
	const message = firstRecord(entry, ['message'])
	const usage = logUsage(firstRecord(message, ['usage']))
	const timestamp = stringField(recordField(entry, 'timestamp'))
	if (message === undefined || usage === undefined || timestamp === undefined) return undefined
	return {
		isSidechain: boolField(recordField(entry, 'isSidechain')),
		messageId: stringField(recordField(message, 'id')),
		model: firstString(message, ['model']),
		provider: 'claude',
		requestId: stringField(recordField(entry, 'requestId')),
		timestamp,
		usage: claudeUsage(usage)
	}
}

function eventTotal(event: ClaudeEvent) {
	return tokenUsage(event.usage).totalTokens
}

function dedupeClaudeEvents(events: readonly ClaudeEvent[]) {
	const deduped: ClaudeEvent[] = []
	for (const event of events) {
		const index = deduped.findIndex(
			candidate =>
				event.messageId !== undefined &&
				candidate.messageId === event.messageId &&
				(candidate.requestId === event.requestId || event.isSidechain === true || candidate.isSidechain === true)
		)
		if (index >= 0) {
			const existing = deduped[index]!
			if (
				(existing.isSidechain === true && event.isSidechain !== true) ||
				(existing.isSidechain === event.isSidechain && eventTotal(event) > eventTotal(existing))
			) {
				deduped[index] = event
			}
		} else {
			deduped.push(event)
		}
	}
	return deduped
}

function parseClaudeFile(_path: string, content: string) {
	const events: ClaudeEvent[] = []
	for (const line of content.split(/\r?\n/u)) {
		if (!line.includes('"usage"')) continue
		const event = parseClaudePayload(parseLine(line))
		if (event !== undefined) events.push(event)
	}
	return events
}

function collectJsonlFiles(root: string) {
	const files: string[] = []
	const walk = (dir: string) => {
		for (const entry of readDirEntries(dir)) {
			const path = join(dir, entry.name)
			if (entry.isDirectory()) walk(path)
			if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path)
		}
	}
	walk(root)
	return files.sort((left, right) => left.localeCompare(right))
}

function readDirEntries(dir: string) {
	try {
		return readdirSync(dir, {encoding: 'utf8', withFileTypes: true})
	} catch {
		return []
	}
}

function cachedFileEvents(
	cache: FileCacheEntry[],
	path: string,
	parse: (path: string, content: string) => readonly UsageEvent[]
) {
	const stats = statSync(path)
	const cached = cache.find(
		entry => entry.path === path && entry.size === stats.size && entry.mtimeMs === stats.mtimeMs
	)
	if (cached !== undefined) return cached.events
	const events = parse(path, readFileSync(path, 'utf8'))
	cache.push({events, mtimeMs: stats.mtimeMs, path, size: stats.size})
	return events
}

function normalizeHomePath(path: string, home: string) {
	if (path === '~') return home
	if (path.startsWith('~/')) return join(home, path.slice(2))
	return path
}

function claudeRoots(env: Record<string, string | undefined>, home: string) {
	if (env['CLAUDE_CONFIG_DIR'] !== undefined) {
		return env['CLAUDE_CONFIG_DIR']
			.split(',')
			.map(path => normalizeHomePath(path.trim(), home))
			.filter(path => path !== '')
			.map(path => (path.endsWith('/projects') ? path.slice(0, -'/projects'.length) : path))
			.filter(path => existsSync(join(path, 'projects')))
	}
	const xdg = env['XDG_CONFIG_HOME'] ?? join(home, '.config')
	return [join(xdg, 'claude'), join(home, '.claude')].filter(path => existsSync(join(path, 'projects')))
}

function loadClaudeEvents(cache: FileCacheEntry[], env: Record<string, string | undefined>, home: string) {
	return dedupeClaudeEvents(
		claudeRoots(env, home).flatMap(root =>
			collectJsonlFiles(join(root, 'projects')).flatMap(
				file => cachedFileEvents(cache, file, parseClaudeFile) as ClaudeEvent[]
			)
		)
	)
}

function codexRoots(env: Record<string, string | undefined>, home: string) {
	if (env['CODEX_HOME'] !== undefined) {
		return env['CODEX_HOME']
			.split(',')
			.map(path => normalizeHomePath(path.trim(), home))
			.filter(path => path !== '')
	}
	return [join(home, '.codex')]
}

function codexSources(env: Record<string, string | undefined>, home: string) {
	return codexRoots(env, home).flatMap(root => {
		const sources: Array<{dedupeScope: string; root: string}> = []
		const sessions = join(root, 'sessions')
		const archived = join(root, 'archived_sessions')
		if (existsSync(sessions)) sources.push({dedupeScope: root, root: sessions})
		if (existsSync(archived)) sources.push({dedupeScope: root, root: archived})
		if (sources.length === 0 && existsSync(root)) sources.push({dedupeScope: root, root})
		return sources
	})
}

function codexUsageFromContainer(value: unknown) {
	return logUsage(firstRecord(value, ['usage']))
}

function codexModel(value: unknown) {
	const metadata = firstRecord(value, ['metadata'])
	return firstString(value, ['model', 'model_name']) ?? firstString(metadata, ['model'])
}

function codexTimestamp(value: unknown) {
	const raw = recordField(value, 'timestamp') ?? recordField(value, 'created_at') ?? recordField(value, 'createdAt')
	if (typeof raw === 'number' && Number.isFinite(raw))
		return new Date(raw > 10_000_000_000 ? raw : raw * 1000).toISOString()
	return stringField(raw)
}

function codexNested<T>(value: unknown, read: (value: unknown) => T | undefined) {
	return (
		read(value) ??
		read(firstRecord(value, ['data'])) ??
		read(firstRecord(value, ['result'])) ??
		read(firstRecord(value, ['response']))
	)
}

function parseCodexFile(path: string, content: string) {
	const events: UsageEvent[] = []
	let previousTotal: LogUsage | undefined
	let currentModel: string | undefined
	const fallbackTimestamp = new Date(statSync(path).mtimeMs).toISOString()
	for (const line of content.split(/\r?\n/u)) {
		if (!line.includes('"token_count"') && !line.includes('"turn_context"') && !line.includes('"usage"')) continue
		const value = parseLine(line)
		if (!isRecord(value)) continue
		const type = stringField(recordField(value, 'type'))
		if (type === 'turn_context') {
			currentModel = codexModel(firstRecord(value, ['payload'])) ?? currentModel
			continue
		}
		if (type === 'event_msg') {
			const payload = firstRecord(value, ['payload'])
			if (stringField(recordField(payload, 'type')) !== 'token_count') continue
			const info = firstRecord(payload, ['info'])
			const totalUsage = logUsage(firstRecord(info, ['total_token_usage', 'totalTokenUsage']))
			const usage =
				logUsage(firstRecord(info, ['last_token_usage', 'lastTokenUsage'])) ??
				(totalUsage === undefined ? undefined : usageDelta(totalUsage, previousTotal))
			if (totalUsage !== undefined) previousTotal = totalUsage
			const timestamp = stringField(recordField(value, 'timestamp'))
			if (usage === undefined || timestamp === undefined) continue
			events.push({
				model: codexModel(payload) ?? codexModel(info) ?? currentModel ?? 'gpt-5.5',
				provider: 'codex',
				timestamp,
				usage: codexUsage(usage)
			})
			continue
		}
		const usage = codexNested(value, codexUsageFromContainer)
		if (usage === undefined) continue
		const model = codexNested(value, codexModel)
		if (model !== undefined) currentModel = model
		events.push({
			model: model ?? currentModel ?? 'gpt-5.5',
			provider: 'codex',
			timestamp: codexNested(value, codexTimestamp) ?? fallbackTimestamp,
			usage: codexUsage(usage)
		})
	}
	return events
}

function loadCodexEvents(cache: FileCacheEntry[], env: Record<string, string | undefined>, home: string) {
	const seenFiles = new Set<string>()
	const events: UsageEvent[] = []
	for (const source of codexSources(env, home)) {
		for (const file of collectJsonlFiles(source.root)) {
			const key = `${source.dedupeScope}\u0000${relative(source.root, file)}`
			if (seenFiles.has(key)) continue
			seenFiles.add(key)
			events.push(...cachedFileEvents(cache, file, parseCodexFile))
		}
	}
	const seenEvents = new Set<string>()
	return events.filter(event => {
		const key = [
			event.timestamp,
			event.model ?? '',
			event.usage.inputTokens.total ?? 0,
			event.usage.inputTokens.cacheRead ?? 0,
			event.usage.outputTokens.text ?? 0,
			event.usage.outputTokens.reasoning ?? 0,
			tokenUsage(event.usage).totalTokens
		].join('\u0000')
		if (seenEvents.has(key)) return false
		seenEvents.add(key)
		return true
	})
}

function dateKey(date: Date) {
	const year = date.getFullYear()
	const month = `${date.getMonth() + 1}`.padStart(2, '0')
	const day = `${date.getDate()}`.padStart(2, '0')
	return `${year}-${month}-${day}`
}

function monthKey(date: Date) {
	const year = date.getFullYear()
	const month = `${date.getMonth() + 1}`.padStart(2, '0')
	return `${year}-${month}`
}

function addUsage(left: Response.Usage, right: Response.Usage) {
	return new Response.Usage({
		inputTokens: {
			cacheRead: (left.inputTokens.cacheRead ?? 0) + (right.inputTokens.cacheRead ?? 0),
			cacheWrite: (left.inputTokens.cacheWrite ?? 0) + (right.inputTokens.cacheWrite ?? 0),
			total: (left.inputTokens.total ?? 0) + (right.inputTokens.total ?? 0),
			uncached: (left.inputTokens.uncached ?? 0) + (right.inputTokens.uncached ?? 0)
		},
		outputTokens: {
			reasoning: (left.outputTokens.reasoning ?? 0) + (right.outputTokens.reasoning ?? 0),
			text: (left.outputTokens.text ?? 0) + (right.outputTokens.text ?? 0),
			total: (left.outputTokens.total ?? 0) + (right.outputTokens.total ?? 0)
		}
	})
}

function addModelUsage(usages: Array<{model?: string; usage: Response.Usage}>, event: UsageEvent) {
	const existing = usages.find(item => item.model === event.model)
	if (existing === undefined) {
		usages.push({model: event.model, usage: event.usage})
	} else {
		existing.usage = addUsage(existing.usage, event.usage)
	}
}

function aggregateProvider(provider: Provider, events: readonly UsageEvent[], now: Date) {
	let totalUsage = zeroUsage()
	let todayUsage = zeroUsage()
	let monthUsage = zeroUsage()
	const totalModelUsages: Array<{model?: string; usage: Response.Usage}> = []
	const todayModelUsages: Array<{model?: string; usage: Response.Usage}> = []
	const monthModelUsages: Array<{model?: string; usage: Response.Usage}> = []
	const today = dateKey(now)
	const month = monthKey(now)
	for (const event of events) {
		const date = new Date(event.timestamp)
		if (Number.isNaN(date.getTime())) continue
		totalUsage = addUsage(totalUsage, event.usage)
		addModelUsage(totalModelUsages, event)
		if (dateKey(date) === today) {
			todayUsage = addUsage(todayUsage, event.usage)
			addModelUsage(todayModelUsages, event)
		}
		if (monthKey(date) === month) {
			monthUsage = addUsage(monthUsage, event.usage)
			addModelUsage(monthModelUsages, event)
		}
	}
	return UsageTokenProvider.make({
		month: {modelUsages: monthModelUsages, usage: monthUsage},
		provider,
		today: {modelUsages: todayModelUsages, usage: todayUsage},
		total: {modelUsages: totalModelUsages, usage: totalUsage}
	})
}

function loadUsageTokensWithCache(cache: FileCacheEntry[], options: LoadUsageTokensOptions = {}) {
	const env = options.env ?? process.env
	const home = options.home ?? env['HOME'] ?? homedir()
	const now = options.now ?? new Date()
	return UsageTokens.make({
		providers: [
			aggregateProvider('claude', loadClaudeEvents(cache, env, home), now),
			aggregateProvider('codex', loadCodexEvents(cache, env, home), now)
		],
		updatedAt: now.toISOString()
	})
}

export function makeUsageTokenLoader() {
	const cache: FileCacheEntry[] = []
	return (options: LoadUsageTokensOptions = {}) => loadUsageTokensWithCache(cache, options)
}

export function loadUsageTokens(options: LoadUsageTokensOptions = {}) {
	return makeUsageTokenLoader()(options)
}
