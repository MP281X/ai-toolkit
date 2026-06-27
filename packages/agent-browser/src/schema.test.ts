import {HashMap, Option, pipe} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {agentBrowserOwnedTabLabel, agentBrowserOwnedTabLabels} from './schema.ts'

function label(labels: HashMap.HashMap<string, string>, origin: string) {
	return pipe(labels, HashMap.get(origin), Option.getOrUndefined)
}

describe('agentBrowserOwnedTabLabel', () => {
	it('strips localhost and the worktree segment from a single portless origin', () => {
		expect(agentBrowserOwnedTabLabel('http://client.workbench.ks3l4x.localhost:5010')).toBe('client-workbench')
		expect(agentBrowserOwnedTabLabel('http://client.workbench.ks3l4x.localhost:5010')).toBe(
			agentBrowserOwnedTabLabel('http://client.workbench.ks3l4x.localhost:5010')
		)
	})

	it('keeps different portless routes distinct', () => {
		expect(agentBrowserOwnedTabLabel('http://client.workbench.ks3l4x.localhost:5010')).not.toBe(
			agentBrowserOwnedTabLabel('http://server.workbench.ks3l4x.localhost:5010')
		)
	})
})

describe('agentBrowserOwnedTabLabels', () => {
	it('creates compact labels for the active portless batch', () => {
		const labels = agentBrowserOwnedTabLabels([
			'http://client.deslop-portfolio.feat-agent-browser.localhost:5010',
			'http://server.deslop-portfolio.feat-agent-browser.localhost:5010',
			'http://client.deslop-workbench.feat-agent-browser.localhost:5010',
			'http://server.deslop-workbench.feat-agent-browser.localhost:5010'
		])

		expect(label(labels, 'http://client.deslop-portfolio.feat-agent-browser.localhost:5010')).toBe(
			'client-deslop-portfolio'
		)
		expect(label(labels, 'http://server.deslop-portfolio.feat-agent-browser.localhost:5010')).toBe(
			'server-deslop-portfolio'
		)
		expect(label(labels, 'http://client.deslop-workbench.feat-agent-browser.localhost:5010')).toBe(
			'client-deslop-workbench'
		)
		expect(label(labels, 'http://server.deslop-workbench.feat-agent-browser.localhost:5010')).toBe(
			'server-deslop-workbench'
		)
	})

	it('removes common batch prefix and suffix tokens', () => {
		const labels = agentBrowserOwnedTabLabels([
			'http://app.client.shared.ks3l4x.localhost:5010',
			'http://app.server.shared.ks3l4x.localhost:5010'
		])

		expect(label(labels, 'http://app.client.shared.ks3l4x.localhost:5010')).toBe('client')
		expect(label(labels, 'http://app.server.shared.ks3l4x.localhost:5010')).toBe('server')
	})

	it('preserves package hyphens and keeps labels valid for agent-browser', () => {
		const labels = agentBrowserOwnedTabLabels([
			'http://client.deslop-portfolio.feat-agent-browser.localhost:5010',
			'http://server.deslop-workbench.feat-agent-browser.localhost:5010'
		])

		for (const value of HashMap.values(labels)) {
			expect(value).toMatch(/^[a-z][a-z0-9_-]*$/u)
		}
		expect(label(labels, 'http://client.deslop-portfolio.feat-agent-browser.localhost:5010')).toBe(
			'client-deslop-portfolio'
		)
		expect(label(labels, 'http://server.deslop-workbench.feat-agent-browser.localhost:5010')).toBe(
			'server-deslop-workbench'
		)
	})
})
