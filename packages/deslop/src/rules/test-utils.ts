import {Array} from 'effect'

import {expect} from 'bun:test'
import {analyzeText, analyzeTypedText} from '#lib/analyzer.ts'

export function expectRule(testCase: {
	readonly rule: string
	readonly source: string
	readonly typed?: boolean
	readonly filePath?: string
}) {
	const diagnostics = testCase.typed
		? analyzeTypedText(testCase.filePath ?? 'sample.ts', testCase.source)
		: analyzeText(testCase.filePath ?? 'sample.ts', testCase.source)

	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).toContain(testCase.rule)
}

export function expectNoRule(rule: string, source: string, filePath = 'sample.ts') {
	expect(Array.map(analyzeText(filePath, source), diagnostic => diagnostic.rule)).not.toContain(rule)
}
