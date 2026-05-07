import {Array, String} from 'effect'

import ts from 'typescript'

import {declarationName} from '#lib/ts.ts'
import type {Rule} from './helpers.ts'
import {hasExtends, isAllowedPublicDeclaration, isExportedDeclaration, nameNodeForDeclaration, rule} from './helpers.ts'

export const architectureRules = [
	rule('no-type-only-file', (node, context) => {
		if (!ts.isSourceFile(node)) return
		if (node.statements.length === 0) return
		if (
			Array.every(node.statements, statement => {
				return (
					ts.isInterfaceDeclaration(statement) ||
					ts.isTypeAliasDeclaration(statement) ||
					(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true) ||
					(ts.isExportDeclaration(statement) && statement.isTypeOnly)
				)
			})
		) {
			context.report(
				node,
				'no-type-only-file',
				`"${context.filePath}" contains only types. Move each type to its consumer file and delete this type-only module.`
			)
		}
	}),
	rule('no-re-export', (node, context) => {
		if (!(ts.isExportDeclaration(node) || ts.isExportAssignment(node))) return
		context.report(
			node,
			'no-re-export',
			`"${context.filePath}" re-exports a symbol. Export the symbol only where it is defined and update consumers to import that concrete module.`
		)
	}),
	rule('no-fake-public-export', (node, context) => {
		if (!isExportedDeclaration(node)) return
		const name = declarationName(node)
		if (name !== '<root>' && (context.references.get(name) ?? 0) <= 1 && !isAllowedPublicDeclaration(node)) {
			context.report(
				nameNodeForDeclaration(node),
				'no-fake-public-export',
				`"${name}" is exported without an external consumer. Remove export, or move the declaration to the file that uses it.`
			)
		}
	}),
	rule('no-cross-file-single-consumer-symbol', (node, context) => {
		if (!isExportedDeclaration(node)) return
		if (!String.startsWith('packages/deslop/')(context.filePath)) return
		if (
			Array.contains(
				[
					'packages/deslop/src/lib/analyzer.ts',
					'packages/deslop/src/lib/ts.ts',
					'packages/deslop/src/rules/helpers.ts',
					'packages/deslop/src/rules/test-utils.ts'
				] as const,
				context.filePath
			)
		) {
			return
		}
		const name = declarationName(node)
		if (name === '<root>' || isAllowedPublicDeclaration(node)) return
		const consumerFiles = Array.filter(Array.fromIterable(context.referenceFiles.get(name) ?? []), filePath => {
			return !String.endsWith(context.filePath)(filePath)
		})
		if (Array.length(consumerFiles) === 1) {
			context.report(
				nameNodeForDeclaration(node),
				'no-cross-file-single-consumer-symbol',
				`"${name}" is exported here but used only by "${consumerFiles[0]}". Move the declaration to that file and delete the export.`
			)
		}
	}),
	rule('no-regex-literal', (node, context) => {
		if (ts.isRegularExpressionLiteral(node)) {
			context.report(
				node,
				'no-regex-literal',
				'This uses a regex literal. Replace it with RegExp(...) at the use site.'
			)
		}
	}),
	rule('prefer-node-subpath-import', (node, context) => {
		if (!(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))) return
		if (Array.contains(['fs', 'path', 'os', 'crypto', 'stream'] as const, node.moduleSpecifier.text)) {
			context.report(
				node.moduleSpecifier,
				'prefer-node-subpath-import',
				`"${node.moduleSpecifier.text}" is a bare Node import. Change the module specifier to "node:${node.moduleSpecifier.text}".`
			)
		}
	}),
	rule('no-internal-barrel-import', (node, context) => {
		if (!(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))) return
		if (
			String.endsWith('/index')(node.moduleSpecifier.text) ||
			String.endsWith('/index.ts')(node.moduleSpecifier.text) ||
			node.moduleSpecifier.text === '.'
		) {
			context.report(
				node.moduleSpecifier,
				'no-internal-barrel-import',
				'This imports through an internal barrel. Import the concrete source module directly and remove the barrel when it has no users.'
			)
		}
	}),
	rule('no-plain-class', (node, context) => {
		if (ts.isClassDeclaration(node) && !hasExtends(node)) {
			context.report(
				node.name ?? node,
				'no-plain-class',
				`"${node.name?.text ?? 'class'}" is a plain class without framework semantics. Replace it with plain data, a Schema class, or an Effect service.`
			)
		}
	})
] as const satisfies readonly Rule[]
