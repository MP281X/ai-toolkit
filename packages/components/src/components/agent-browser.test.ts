import {describe, expect, it} from 'vite-plus/test'

import {agentBrowserActiveOwnedTabId, agentBrowserCanvasPoint} from './agent-browser.tsx'

const ownedTabs = [
	{
		id: 'http://client.deslop-portfolio.feat-agent-browser.localhost:5010',
		label: 'client',
		streamLabel: 'client-deslop-portfolio',
		url: 'http://client.deslop-portfolio.feat-agent-browser.localhost:5010'
	},
	{
		id: 'http://server.deslop-portfolio.feat-agent-browser.localhost:5010',
		label: 'server',
		streamLabel: 'server-deslop-portfolio',
		url: 'http://server.deslop-portfolio.feat-agent-browser.localhost:5010'
	}
]

describe('agentBrowserActiveOwnedTabId', () => {
	it('maps stream active state back to app-owned tab ids', () => {
		expect(
			agentBrowserActiveOwnedTabId({
				ownedTabs,
				streamTabs: [
					{active: false, label: 'external-tab', tabId: 't1'},
					{active: true, label: 'server-deslop-portfolio', tabId: 't2'}
				]
			})
		).toBe('http://server.deslop-portfolio.feat-agent-browser.localhost:5010')
	})

	it('ignores unknown browser-created tabs', () => {
		expect(
			agentBrowserActiveOwnedTabId({ownedTabs, streamTabs: [{active: true, label: 'external-tab', tabId: 't9'}]})
		).toBeUndefined()
	})
})

describe('agentBrowserCanvasPoint', () => {
	it('maps pointer coordinates through horizontal letterboxing', () => {
		expect(
			agentBrowserCanvasPoint({
				clientX: 500,
				clientY: 450,
				rect: {height: 900, left: 0, top: 0, width: 1800},
				viewport: {height: 900, width: 1600}
			})
		).toEqual({x: 400, y: 450})
	})

	it('drops points outside the rendered canvas image', () => {
		expect(
			agentBrowserCanvasPoint({
				clientX: 50,
				clientY: 450,
				rect: {height: 900, left: 0, top: 0, width: 1800},
				viewport: {height: 900, width: 1600}
			})
		).toBeUndefined()
	})
})
