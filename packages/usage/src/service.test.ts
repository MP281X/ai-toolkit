import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {ConfigProvider, Effect, FileSystem, Layer, pipe} from 'effect'

import {HttpClient, HttpClientResponse, type HttpClientRequest} from 'effect/unstable/http'
import {describe, expect, it} from 'vite-plus/test'

import {Usage} from './service.ts'

const claudeBody = {
	five_hour: {resets_at: '2026-06-11T22:39:59+00:00', utilization: 21},
	seven_day: {resets_at: '2026-06-13T09:59:59+00:00', utilization: 31}
}

const codexBody = {
	rate_limit: {
		primary_window: {reset_at: 1781232752, used_percent: 0},
		secondary_window: {reset_at: 1781766496, used_percent: 1}
	}
}

function jsonResponse(request: HttpClientRequest.HttpClientRequest, body: unknown, status = 200) {
	return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body), {status}))
}

function usageWith<T>(
	respond: (request: HttpClientRequest.HttpClientRequest) => HttpClientResponse.HttpClientResponse,
	run: (usage: typeof Usage.Service) => Effect.Effect<T, unknown>,
	configure: (fs: FileSystem.FileSystem, home: string) => Effect.Effect<void, unknown> = () => Effect.void
) {
	return Effect.runPromise(
		pipe(
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const home = yield* fs.makeTempDirectoryScoped({prefix: 'deslop-usage-'})
				yield* fs.makeDirectory(join(home, '.claude'))
				yield* fs.makeDirectory(join(home, '.codex'))
				yield* fs.writeFileString(
					join(home, '.claude', '.credentials.json'),
					JSON.stringify({claudeAiOauth: {accessToken: 'claude-token'}})
				)
				yield* fs.writeFileString(
					join(home, '.codex', 'auth.json'),
					JSON.stringify({tokens: {access_token: 'codex-token'}})
				)
				yield* configure(fs, home)

				return yield* pipe(
					Effect.gen(function* () {
						return yield* run(yield* Usage)
					}),
					Effect.provide(Usage.layer),
					Effect.provide(
						Layer.succeed(
							HttpClient.HttpClient,
							HttpClient.make(request => Effect.sync(() => respond(request)))
						)
					),
					Effect.provide(NodeServices.layer),
					Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({HOME: home})))
				)
			}),
			Effect.scoped,
			Effect.provide(NodeServices.layer)
		)
	)
}

describe('@deslop/usage service', () => {
	it('decodes both provider responses', async () => {
		const requests: HttpClientRequest.HttpClientRequest[] = []
		const result = await usageWith(
			request => {
				requests.push(request)
				return request.url.includes('anthropic') ? jsonResponse(request, claudeBody) : jsonResponse(request, codexBody)
			},
			usage => Effect.all({claude: usage.claude, codex: usage.codex})
		)

		expect(result.claude).toEqual({
			fiveHour: {resetsAt: '2026-06-11T22:39:59+00:00', utilization: 21},
			weekly: {resetsAt: '2026-06-13T09:59:59+00:00', utilization: 31}
		})
		expect(result.codex).toEqual({
			fiveHour: {resetsAt: new Date(1781232752 * 1000).toISOString(), utilization: 0},
			weekly: {resetsAt: new Date(1781766496 * 1000).toISOString(), utilization: 1}
		})

		const claudeRequest = requests.find(request => request.url.includes('anthropic'))
		expect(claudeRequest?.headers['anthropic-beta']).toBe('oauth-2025-04-20')
		expect(claudeRequest?.headers['user-agent']).toMatch(/^claude-code\//u)
		expect(claudeRequest?.headers['authorization']).toBe('Bearer claude-token')
		const codexRequest = requests.find(request => request.url.includes('chatgpt'))
		expect(codexRequest?.headers['authorization']).toBe('Bearer codex-token')
	})

	it('reports system utilization percentages', async () => {
		const result = await usageWith(
			request => jsonResponse(request, {}),
			usage => usage.system
		)

		expect(result.cpuUtilization).toBeGreaterThanOrEqual(0)
		expect(result.cpuUtilization).toBeLessThanOrEqual(100)
		expect(result.memoryUtilization).toBeGreaterThanOrEqual(0)
		expect(result.memoryUtilization).toBeLessThanOrEqual(100)
	})

	it('fails with a sign-in error on 401 without breaking the other provider', async () => {
		const result = await usageWith(
			request =>
				request.url.includes('anthropic') ? jsonResponse(request, {}, 401) : jsonResponse(request, codexBody),
			usage => Effect.all({claude: Effect.flip(usage.claude), codex: usage.codex})
		)

		expect(result.claude).toMatchObject({_tag: 'UsageError', message: 'not signed in'})
		expect(result.codex.fiveHour.utilization).toBe(0)
	})

	it('fails with a sign-in error when codex credentials are missing', async () => {
		const error = await usageWith(
			request => jsonResponse(request, claudeBody),
			usage => Effect.flip(usage.codex),
			(fs, home) => fs.remove(join(home, '.codex', 'auth.json'))
		)

		expect(error).toMatchObject({_tag: 'UsageError', message: 'not signed in'})
	})

	it('fails with usage errors on unexpected statuses and malformed bodies', async () => {
		const result = await usageWith(
			request =>
				request.url.includes('anthropic') ? jsonResponse(request, {}, 500) : jsonResponse(request, {rate_limit: {}}),
			usage => Effect.all({claude: Effect.flip(usage.claude), codex: Effect.flip(usage.codex)})
		)

		expect(result.claude).toMatchObject({_tag: 'UsageError', message: 'claude usage responded with status 500'})
		expect(result.codex._tag).toBe('UsageError')
	})
})
