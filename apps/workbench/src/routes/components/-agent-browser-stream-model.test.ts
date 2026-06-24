import {describe, expect, it} from 'vite-plus/test'

import {initialAgentBrowserStreamState, reduceAgentBrowserStreamMessage} from './-agent-browser-stream-model.ts'

describe('reduceAgentBrowserStreamMessage', () => {
	it('tracks frame, status, tabs, console, and result messages', () => {
		const initial = initialAgentBrowserStreamState()
		const withFrame = reduceAgentBrowserStreamMessage(initial, {
			data: 'abc',
			metadata: {deviceHeight: 720, deviceWidth: 1280},
			type: 'frame'
		})
		const withStatus = reduceAgentBrowserStreamMessage(withFrame, {status: {connected: true}, type: 'status'})
		const withTabs = reduceAgentBrowserStreamMessage(withStatus, {
			tabs: [{id: 't1', title: 'App', url: 'http://localhost'}],
			type: 'tabs'
		})
		const withConsole = reduceAgentBrowserStreamMessage(withTabs, {level: 'warn', message: 'careful', type: 'console'})
		const withResult = reduceAgentBrowserStreamMessage(withConsole, {result: {ok: true}, type: 'result'})

		expect(withResult.frame?.data).toBe('abc')
		expect(withResult.status).toBe('{"connected":true}')
		expect(withResult.tabs[0]?.id).toBe('t1')
		expect(withResult.console[0]?.message).toBe('careful')
		expect(withResult.result).toBe('{"ok":true}')
	})

	it('ignores unknown messages', () => {
		const initial = initialAgentBrowserStreamState()
		expect(reduceAgentBrowserStreamMessage(initial, {type: 'other'})).toBe(initial)
	})
})
