import {describe, expect, it} from '@effect/vitest'

import {rewritePortlessHtmlResponse} from './service.ts'

describe('rewritePortlessHtmlResponse', () => {
	it('injects scan and grab into HTML with a head element', () => {
		const rewritten = rewritePortlessHtmlResponse({
			contentType: 'text/html; charset=utf-8',
			html: '<!doctype html><html><head><title>App</title></head><body></body></html>',
			method: 'GET'
		})

		expect(rewritten).toContain('<head><script>')
		expect(rewritten).toContain('https://unpkg.com/react-scan/dist/auto.global.js')
		expect(rewritten).toContain("window.reactScan?.({allowInIframe:true,_debug:'verbose'})")
		expect(rewritten).toContain('https://unpkg.com/react-grab/dist/index.global.js')
	})

	it('prepends the loader when HTML has no head element', () => {
		const rewritten = rewritePortlessHtmlResponse({contentType: 'text/html', html: '<main>App</main>', method: 'GET'})

		expect(rewritten?.startsWith('<script>')).toBe(true)
		expect(rewritten).toContain('<main>App</main>')
	})

	it('does not rewrite non-HTML responses', () => {
		expect(
			rewritePortlessHtmlResponse({contentType: 'application/json', html: '{"ok":true}', method: 'GET'})
		).toBeUndefined()
	})

	it('does not inject the old browser bridge', () => {
		const rewritten = rewritePortlessHtmlResponse({
			contentType: 'text/html',
			html: '<html><head></head></html>',
			method: 'GET'
		})

		expect(rewritten).not.toContain('__deslopBrowserBridge')
		expect(rewritten).not.toContain('console forwarding')
		expect(rewritten).not.toContain('localStorage.clear')
	})

	it('guards instrumentation in webdriver-driven browsers', () => {
		const rewritten = rewritePortlessHtmlResponse({
			contentType: 'text/html',
			html: '<html><head></head></html>',
			method: 'GET'
		})

		expect(rewritten).toContain('navigator.webdriver===true')
	})
})
