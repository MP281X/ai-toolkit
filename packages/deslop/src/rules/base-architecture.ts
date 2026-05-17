import {Array} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {hasExtends, rule} from './helpers.ts'

export const baseArchitectureRules = [
	rule('no-deprecated-api', (node, context) => {
		if (!context.checker) return
		if (!(ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))) return
		const symbol = context.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node)
		const deprecation = Array.findFirst(
			(symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
				? context.checker.getAliasedSymbol(symbol)
				: symbol
			)?.getJsDocTags(context.checker) ?? [],
			tag => tag.name === 'deprecated'
		)
		if (deprecation._tag === 'None') return
		context.report(ts.isPropertyAccessExpression(node) ? node.name : node, 'no-deprecated-api', {
			description: `"${node.getText(context.sourceFile)}" is deprecated.`,
			fix: deprecation.value.text
				? ts.displayPartsToString(deprecation.value.text)
				: 'Replace it with the supported API from the same module.'
		})
	}),
	rule('no-plain-class', (node, context) => {
		if (ts.isClassDeclaration(node) && !hasExtends(node)) {
			context.report(node.name ?? node, 'no-plain-class', {
				description: `Class "${node.name?.text ?? '<anonymous>'}" has no extends clause.`,
				fix: 'Replace with plain data, Schema.Class, or an Effect service class.'
			})
		}
	})
] as const satisfies readonly Rule[]
