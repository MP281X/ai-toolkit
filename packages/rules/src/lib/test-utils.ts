import {parseSync} from 'oxc-parser'

import type {Rule} from '../rules.ts'

import {forEachChild, isNode} from '#lib/ast.ts'
import type {Node, RuleContext, RuleVisitors} from '#lib/ast.ts'

export type RuleDiagnostic = {readonly message: string; readonly nodeType: string}

export type RunRuleOptions = {readonly filename?: string}

function attachParentReferences(node: Node) {
	forEachChild(node, child => {
		Object.defineProperty(child, 'parent', {configurable: true, enumerable: false, value: node})
		attachParentReferences(child)
	})
}

function dispatch(node: Node, visitors: RuleVisitors) {
	visitors[node.type]?.(node)
	forEachChild(node, child => {
		dispatch(child, visitors)
	})
	visitors[`${node.type}:exit`]?.(node)
}

function parse(code: string, options: RunRuleOptions) {
	const parsed = parseSync(options.filename ?? 'fixture.tsx', code, {astType: 'ts', lang: 'tsx'})
	if (isNode(parsed.program)) return parsed.program
	throw new Error('Expected parser to return a Program node.')
}

export function runRule(rule: Rule, code: string, options: RunRuleOptions = {}): readonly RuleDiagnostic[] {
	const program = parse(code, options)
	attachParentReferences(program)
	const diagnostics = new Set<RuleDiagnostic>()
	const context = {
		filename: options.filename,
		report: descriptor => {
			diagnostics.add({message: descriptor.message, nodeType: descriptor.node.type})
		}
	} satisfies RuleContext
	dispatch(program, rule.create(context))
	return [...diagnostics]
}
