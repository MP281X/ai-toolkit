import {Array, Option, pipe, String} from 'effect'

import ts from 'typescript'

export const typeIndirectionRules = [
	{
		name: 'type-rules',
		apply(
			node: ts.Node,
			_references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			checker?: ts.TypeChecker
		) {
			if (ts.isModuleDeclaration(node) && hasExportModifier(node) && !hasDeclareModifier(node)) {
				report(
					node.name,
					'no-export-namespace',
					'Do not use `export namespace`. Export plain values and types instead; only `export declare namespace` is allowed for external declarations.'
				)
			}

			if (isInsideDeclareModule(node)) {
				return
			}

			if (ts.isTypeReferenceNode(node) && isDerivedComponentPropsType(node)) {
				report(
					node,
					'no-derived-component-props-type',
					'Do not derive component props from other components with Pick, Omit, or ComponentProps. Inline the exact prop shape at the boundary.'
				)
			}

			if (ts.isInterfaceDeclaration(node)) {
				if (pipe(node.name.text, String.endsWith('Props'))) {
					report(
						node.name,
						'no-named-props-type',
						'Component props must be inline. Replace this named props type with an inline object at the component boundary.'
					)
					report(
						node.name,
						'no-props-interface-for-component',
						'This props interface hides component inputs. Inline props in the component parameter.'
					)
				}

				report(
					node.name,
					'no-interface-for-object-shape',
					'This interface hides a local shape. Inline the shape at the consuming boundary.'
				)
			}

			if (ts.isTypeAliasDeclaration(node)) {
				if (isSchemaCompanionTypeAfterSchema(node)) {
					report(
						node.name,
						'no-schema-type-order',
						'Schema companion types must be declared immediately before the schema value.'
					)
					return
				}

				if (isSchemaCompanionType(node)) {
					return
				}

				analyzeTypeAlias(node, report)
			}

			if (
				ts.isParameter(node) &&
				node.type &&
				ts.isTypeReferenceNode(node.type) &&
				isRuntimeFunctionLike(node.parent) &&
				isLocalShapeReference(node.type, node.parent, checker)
			) {
				report(
					node.type,
					'no-named-function-args-type',
					'This function argument uses a named shape. Inline the object shape at the function boundary.'
				)
			}

			if (ts.isModuleDeclaration(node)) {
				analyzeNamespaceDeclaration(node, report)
			}
		}
	}
]

function isDerivedComponentPropsType(node: ts.TypeReferenceNode) {
	return (
		(ts.isIdentifier(node.typeName) && ['Pick', 'Omit', 'ComponentProps'].includes(node.typeName.text)) ||
		(ts.isQualifiedName(node.typeName) &&
			ts.isIdentifier(node.typeName.right) &&
			node.typeName.right.text === 'ComponentProps')
	)
}

function isInsideDeclareModule(node: ts.Node) {
	return !!ts.findAncestor(
		node,
		element => ts.isModuleDeclaration(element) && ts.isStringLiteral(element.name) && hasDeclareModifier(element)
	)
}

function isLocalShapeReference(node: ts.TypeReferenceNode, parent: ts.SignatureDeclaration, checker?: ts.TypeChecker) {
	return (
		ts.isIdentifier(node.typeName) &&
		!isFunctionTypeParameter(node.typeName, parent) &&
		isProjectTypeReference(node, checker) &&
		!pipe(
			['Map', 'Set', 'Array', 'ReadonlyArray', 'Promise', 'RunOptions', 'Diagnostic', 'Result'],
			Array.contains(node.typeName.text)
		)
	)
}

function isFunctionTypeParameter(node: ts.Identifier, parent: ts.SignatureDeclaration) {
	return pipe(
		parent.typeParameters ?? [],
		Array.some(parameter => parameter.name.text === node.text)
	)
}

function isProjectTypeReference(node: ts.TypeReferenceNode, checker?: ts.TypeChecker) {
	if (!checker) {
		return true
	}

	return pipe(
		checker.getSymbolAtLocation(node.typeName)?.declarations ?? [],
		Array.some(declaration => !declaration.getSourceFile().isDeclarationFile)
	)
}

function analyzeTypeAlias(
	node: ts.TypeAliasDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (ts.isTypeLiteralNode(node.type)) {
		report(
			node.name,
			'no-type-alias-for-object-shape',
			'This named type hides a local shape. Inline the shape at the consuming boundary.'
		)
		return
	}

	if (ts.isFunctionTypeNode(node.type)) {
		report(
			node.name,
			'no-callback-type-alias',
			'This callback type alias hides a function shape. Inline the callback signature where it is consumed.'
		)
		report(
			node.name,
			'no-function-signature-type-alias',
			'This function type alias hides a callback shape. Inline the callback signature where it is consumed.'
		)
		return
	}

	report(
		node.name,
		'no-single-use-type',
		'This named type hides an inferred shape. Inline it instead of preserving type indirection.'
	)
}

function analyzeNamespaceDeclaration(
	node: ts.ModuleDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (!(node.body && ts.isModuleBlock(node.body))) {
		return
	}

	if (hasDeclareModifier(node) && hasCompanionValue(node)) {
		return
	}

	pipe(
		node.body.statements,
		Array.map(statement => {
			if (
				(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
				statement.name.text === 'Props'
			) {
				report(
					statement.name,
					'no-namespace-props-type',
					'This namespace Props type hides component inputs. Inline props in the component parameter.'
				)
			}

			if (ts.isTypeAliasDeclaration(statement) && ts.isFunctionTypeNode(statement.type)) {
				report(
					statement.name,
					'no-namespace-callback-alias',
					'This namespace callback alias hides a function shape. Inline the callback signature where it is consumed.'
				)
			}

			if (
				(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
				statement.name.text !== 'Props'
			) {
				report(
					statement.name,
					'no-local-namespace-type',
					'This namespace type hides a local shape. Inline the shape where it is consumed.'
				)
			}
		})
	)
}

function isSchemaCompanionType(node: ts.TypeAliasDeclaration) {
	return (
		ts.isTypeQueryNode(node.type) &&
		ts.isQualifiedName(node.type.exprName) &&
		ts.isIdentifier(node.type.exprName.left) &&
		node.type.exprName.left.text === node.name.text &&
		node.type.exprName.right.text === 'Type' &&
		pipe(nextStatement(node), statement => !!statement && isSchemaCompanionValue(statement, node.name.text))
	)
}

function isSchemaCompanionTypeAfterSchema(node: ts.TypeAliasDeclaration) {
	return (
		ts.isTypeQueryNode(node.type) &&
		ts.isQualifiedName(node.type.exprName) &&
		ts.isIdentifier(node.type.exprName.left) &&
		node.type.exprName.left.text === node.name.text &&
		node.type.exprName.right.text === 'Type' &&
		pipe(previousStatement(node), statement => !!statement && isSchemaCompanionValue(statement, node.name.text))
	)
}

function nextStatement(node: ts.Statement) {
	if (!(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent))) {
		return
	}
	return pipe(
		node.parent.statements,
		Array.findFirstIndex(statement => statement === node),
		Option.map(index =>
			ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent) ? node.parent.statements[index + 1] : undefined
		),
		Option.getOrUndefined
	)
}

function previousStatement(node: ts.Statement) {
	if (!(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent))) {
		return
	}

	return pipe(
		node.parent.statements,
		Array.findFirstIndex(statement => statement === node),
		Option.map(index =>
			ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent) ? node.parent.statements[index - 1] : undefined
		),
		Option.getOrUndefined
	)
}

function isSchemaCompanionValue(node: ts.Statement, name: string) {
	return (
		ts.isVariableStatement(node) &&
		pipe(
			node.declarationList.declarations,
			Array.some(
				declaration =>
					ts.isIdentifier(declaration.name) &&
					declaration.name.text === name &&
					!!declaration.initializer &&
					isSchemaExpression(declaration.initializer)
			)
		)
	)
}

function isSchemaExpression(node: ts.Expression) {
	return (
		(ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'Schema') ||
		(ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Schema')
	)
}

function isRuntimeFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node) ||
		ts.isMethodDeclaration(node)
	)
}

function hasDeclareModifier(node: ts.ModuleDeclaration) {
	return pipe(
		node.modifiers ?? [],
		Array.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)
	)
}

function hasExportModifier(node: ts.ModuleDeclaration) {
	return pipe(
		node.modifiers ?? [],
		Array.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
	)
}

function hasCompanionValue(node: ts.ModuleDeclaration) {
	return (
		ts.isIdentifier(node.name) &&
		(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent)) &&
		pipe(
			node.parent.statements,
			Array.some(
				statement =>
					(ts.isFunctionDeclaration(statement) && statement.name?.text === node.name.text) ||
					(ts.isVariableStatement(statement) &&
						pipe(
							statement.declarationList.declarations,
							Array.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === node.name.text)
						))
			)
		)
	)
}
