import {Array} from 'effect'

import {describe, expect, test} from 'bun:test'
import {analyzeText, analyzeTypedText} from '../index.ts'

function rulesFor(sourceText: string) {
	return Array.map(analyzeText('sample.ts', sourceText), diagnostic => diagnostic.rule)
}

function typedRulesFor(sourceText: string) {
	return Array.map(analyzeTypedText('sample.ts', sourceText), diagnostic => diagnostic.rule)
}

describe('type-indirection rules', () => {
	test('no-variable-type-annotation', () => {
		expect(rulesFor('const value: string = getValue()')).toContain('no-variable-type-annotation')
	})

	test('no-return-type-annotation', () => {
		expect(rulesFor('function getValue(): string { return value }')).toContain('no-return-type-annotation')
	})

	test('no-interface-for-object-shape', () => {
		expect(rulesFor('interface User { name: string }')).toContain('no-interface-for-object-shape')
	})

	test('no-type-alias-for-object-shape', () => {
		expect(rulesFor('type User = { name: string }')).toContain('no-type-alias-for-object-shape')
	})

	test('no-function-signature-type-alias', () => {
		expect(rulesFor('type OnSave = (value: string) => void')).toContain('no-function-signature-type-alias')
	})

	test('no-named-function-args-type', () => {
		expect(rulesFor('type User = { name: string }; function save(user: User) { return user.name }')).toContain(
			'no-named-function-args-type'
		)
	})

	test('no-single-use-type', () => {
		expect(rulesFor('type UserId = string')).toContain('no-single-use-type')
	})

	test('no-function-signature-type-alias for report aliases', () => {
		expect(rulesFor('type Report = (node: Node, rule: string, message: string) => void')).toContain(
			'no-function-signature-type-alias'
		)
	})

	test('no-named-props-type', () => {
		expect(rulesFor('interface ButtonProps { label: string }')).toContain('no-named-props-type')
	})

	test('no-namespace-props-type', () => {
		expect(rulesFor('namespace Button { export interface Props { label: string } }')).toContain(
			'no-namespace-props-type'
		)
	})

	test('no-local-namespace-type', () => {
		expect(rulesFor('namespace Editor { export interface Handle { focus(): void } }')).toContain(
			'no-local-namespace-type'
		)
	})

	test('no-namespace-callback-alias', () => {
		expect(rulesFor('namespace Form { export type OnSubmit = (value: string) => void }')).toContain(
			'no-namespace-callback-alias'
		)
	})

	test('no-export-namespace', () => {
		expect(rulesFor('export namespace Deslop { export type Mode = string }')).toContain('no-export-namespace')
	})

	test('allows export declare namespace', () => {
		expect(rulesFor('export declare namespace External { export type Value = string }')).not.toContain(
			'no-export-namespace'
		)
	})

	test('lints types inside export declare namespace', () => {
		expect(rulesFor('export declare namespace Deslop { export type Mode = string }')).toContain('no-single-use-type')
	})

	test('allows schema companion type before schema value', () => {
		expect(
			rulesFor(
				'import {Schema} from "effect"; export type AgentId = typeof AgentId.Type; export const AgentId = Schema.Literal("agent")'
			)
		).not.toContain('no-single-use-type')
	})

	test('requires schema companion type before schema value', () => {
		expect(
			rulesFor(
				'import {Schema} from "effect"; export const AgentId = Schema.Literal("agent"); export type AgentId = typeof AgentId.Type'
			)
		).toContain('no-schema-type-order')
	})

	test('no-unnecessary-type-argument for contextually inferred call result', () => {
		expect(
			typedRulesFor(
				'import {Array} from "effect"; declare const comments: readonly {body: string}[] | undefined; const value = comments ?? Array.empty<{body: string}>()'
			)
		).toContain('no-unnecessary-type-argument')
	})

	test('allows necessary type argument without contextual type', () => {
		expect(typedRulesFor('import {Array} from "effect"; const value = Array.empty<{body: string}>()')).not.toContain(
			'no-unnecessary-type-argument'
		)
	})
})
