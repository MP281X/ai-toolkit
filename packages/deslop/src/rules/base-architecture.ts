import {String} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {hasExtends, rule} from './helpers.ts'

export const baseArchitectureRules = [
	rule('no-local-namespace-import', (node, context) => {
		if (!(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))) return
		if (!(node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))) return
		if (!String.startsWith('.')(node.moduleSpecifier.text)) return
		context.report(node.importClause.namedBindings.name, 'no-local-namespace-import', {
			description: `Local namespace import "${node.importClause.namedBindings.name.text}" from "${node.moduleSpecifier.text}" hides used symbols.`,
			fix: 'Import each referenced member by name.'
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
