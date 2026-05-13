import {Array, String} from 'effect'

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
	rule('no-local-namespace-import', (node, context) => {
		if (!(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))) return
		if (!(node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))) return
		if (!String.startsWith('.')(node.moduleSpecifier.text)) return
		context.report(node.importClause.namedBindings.name, 'no-local-namespace-import', {
			description: `Local namespace import "${node.importClause.namedBindings.name.text}" from "${node.moduleSpecifier.text}" hides used symbols.`,
			fix: 'Import each referenced member by name.'
		})
	}),
	rule('no-default-export-except-config', (node, context) => {
		if (
			!(
				ts.isExportAssignment(node) ||
				((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
					Array.some(node.modifiers ?? [], modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))
			)
		) {
			return
		}
		if (/\.config\.[cm]?tsx?$/.test(context.filePath)) return
		context.report(node, 'no-default-export-except-config', {
			description: `Default export is banned in "${context.filePath}".`,
			fix: 'Convert it to a named export; default exports are only allowed in *.config.* files.'
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
