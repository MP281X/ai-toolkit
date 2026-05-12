import {Array} from 'effect'

import {expect} from 'bun:test'
import {analyzeText, analyzeTypedText} from '#lib/analyzer.ts'
import type {RuleScope} from './helpers.ts'

export function expectRule(testCase: {
	readonly rule: string
	readonly source: string
	readonly typed?: boolean
	readonly filePath?: string
	readonly scopes?: readonly RuleScope[]
	readonly scoped?: boolean
}) {
	expect(
		Array.map(
			testCase.typed
				? analyzeTypedText(testCase.filePath ?? 'sample.ts', testCase.source, testCase.scopes, testCase.scoped)
				: analyzeText(testCase.filePath ?? 'sample.ts', testCase.source, testCase.scopes, testCase.scoped),
			diagnostic => diagnostic.rule
		)
	).toContain(testCase.rule)
}

export function expectNoRule(testCase: {
	readonly rule: string
	readonly source: string
	readonly typed?: boolean
	readonly filePath?: string
	readonly scopes?: readonly RuleScope[]
	readonly scoped?: boolean
}) {
	expect(
		Array.map(
			testCase.typed
				? analyzeTypedText(testCase.filePath ?? 'sample.ts', testCase.source, testCase.scopes, testCase.scoped)
				: analyzeText(testCase.filePath ?? 'sample.ts', testCase.source, testCase.scopes, testCase.scoped),
			diagnostic => diagnostic.rule
		)
	).not.toContain(testCase.rule)
}
