import {readFileSync} from 'node:fs'

import {describe, expect, it} from '@effect/vitest'

describe('visualization template', () => {
	it('is a self-contained offline document with the complete-plan contract', () => {
		const template = readFileSync(
			new URL('../.agents/skills/visualization/assets/template.html', import.meta.url),
			'utf8'
		)

		expect(template.match(/<!-- COMPLETE_PLAN -->/gu)).toHaveLength(1)
		expect(template).toContain('<style>')
		expect(template).toContain('<symbol id="icon-arrow-right"')
		expect(template).not.toMatch(/<(?:link|script)\b[^>]*(?:href|src)=/iu)
		expect(template).not.toMatch(/https?:\/\//iu)
	})
})
