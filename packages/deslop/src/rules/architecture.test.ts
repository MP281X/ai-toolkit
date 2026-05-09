import {Array} from 'effect'

import ts from 'typescript'

import {expect, test} from 'bun:test'
import {analyzeSourceFile, collectDeclarations, collectReferenceFiles, collectReferences} from '#lib/analyzer.ts'
import {expectRule} from './test-utils.ts'

test('no-type-only-file', () => {
	return expectRule({rule: 'no-type-only-file', source: 'export type User = { readonly name: string }\n'})
})
test('prefer-type-before-value-with-same-name', () => {
	return expectRule({
		rule: 'prefer-type-before-value-with-same-name',
		source: 'export const AgentEvent = Schema.Union([])\nexport type AgentEvent = typeof AgentEvent.Type\n'
	})
})
test('no-fake-public-export', () => {
	return expectRule({rule: 'no-fake-public-export', source: 'export function helper(value: string) { return value }\n'})
})
test('no-cross-file-single-consumer-symbol', () => {
	const sourceFile = ts.createSourceFile(
		'packages/deslop/src/rules/sample.ts',
		'export function helper(value: string) { return value }\n',
		ts.ScriptTarget.Latest,
		true
	)
	const diagnostics = analyzeSourceFile(
		sourceFile.fileName,
		sourceFile,
		collectReferences([
			sourceFile,
			ts.createSourceFile(
				'packages/deslop/src/rules/consumer.ts',
				'import {helper} from "./sample.ts"\nhelper("value")\n',
				ts.ScriptTarget.Latest,
				true
			)
		]),
		collectReferenceFiles([
			sourceFile,
			ts.createSourceFile(
				'packages/deslop/src/rules/consumer.ts',
				'import {helper} from "./sample.ts"\nhelper("value")\n',
				ts.ScriptTarget.Latest,
				true
			)
		]),
		collectDeclarations([
			sourceFile,
			ts.createSourceFile(
				'packages/deslop/src/rules/consumer.ts',
				'import {helper} from "./sample.ts"\nhelper("value")\n',
				ts.ScriptTarget.Latest,
				true
			)
		])
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).toContain('no-cross-file-single-consumer-symbol')
})
test('prefer-node-subpath-import', () => {
	return expectRule({rule: 'prefer-node-subpath-import', source: 'import {readFile} from "fs"\nreadFile\n'})
})
test('no-internal-barrel-import', () => {
	return expectRule({rule: 'no-internal-barrel-import', source: 'import {x} from "./feature/index"\nx\n'})
})
test('no-plain-class', () => {
	return expectRule({rule: 'no-plain-class', source: 'class User { readonly name = "Ada" }\n'})
})
test('no-re-export', () => {
	return expectRule({
		rule: 'no-re-export',
		source: 'export {architectureRules} from "./architecture.ts"\n',
		filePath: 'src/rules/helpers.ts'
	})
})
