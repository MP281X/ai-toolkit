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
				report(node.name, 'no-export-namespace', 'Replace `export namespace` with separate named exports.')
			}

			if (isInsideDeclareModule(node)) return

			if (ts.isInterfaceDeclaration(node)) {
				if (String.endsWith('Props')(node.name.text)) {
					report(node.name, 'no-named-props-type', 'Inline Props type into component parameter.')
				}

				report(node.name, 'no-interface-for-object-shape', 'Inline type at every use site.')
			}

			if (ts.isTypeAliasDeclaration(node)) {
				if (isSchemaCompanionTypeAfterSchema(node)) {
					return report(
						node.name,
						'no-schema-type-order',
						'Move schema companion type immediately before schema value.'
					)
				}

				if (isSchemaCompanionType(node)) return

				analyzeTypeAlias(node, report)
			}

			if (
				ts.isParameter(node) &&
				node.type &&
				ts.isTypeReferenceNode(node.type) &&
				isRuntimeFunctionLike(node.parent) &&
				isLocalShapeReference(node.type, node.parent, checker)
			) {
				report(node.type, 'no-named-function-args-type', 'Inline local parameter type or remove annotation.')
			}

			if (ts.isModuleDeclaration(node)) {
				analyzeNamespaceDeclaration(node, report)
			}

			if (ts.isCallExpression(node) && checker && hasContextuallyInferredType(node, checker)) {
				const typeArguments = node.typeArguments ?? []

				if (Array.isReadonlyArrayNonEmpty(typeArguments)) {
					report(typeArguments[0], 'no-unnecessary-type-argument', 'Remove unnecessary type argument.')
				}
			}
		}
	}
]

function hasContextuallyInferredType(node: ts.CallExpression, checker: ts.TypeChecker) {
	const contextualType = contextualResultType(node, checker)

	if (!contextualType || isAnyType(contextualType) || !isNullishFallback(node)) return false

	const callType = checker.getTypeAtLocation(node)

	return checker.isTypeAssignableTo(callType, contextualType)
}

function contextualResultType(node: ts.CallExpression, checker: ts.TypeChecker) {
	if (isNullishFallback(node)) {
		return checker.getNonNullableType(checker.getTypeAtLocation(node.parent.left))
	}

	return checker.getContextualType(node)
}

function isNullishFallback(node: ts.CallExpression): node is ts.CallExpression & {parent: ts.BinaryExpression} {
	return (
		ts.isBinaryExpression(node.parent) &&
		node.parent.right === node &&
		node.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
	)
}

function isAnyType(type: ts.Type) {
	return (type.flags & ts.TypeFlags.Any) !== 0
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
		!Array.contains(
			['Map', 'Set', 'Array', 'ReadonlyArray', 'Promise', 'RunOptions', 'Diagnostic', 'Result'],
			node.typeName.text
		)
	)
}

function isFunctionTypeParameter(node: ts.Identifier, parent: ts.SignatureDeclaration) {
	return Array.some(parent.typeParameters ?? [], parameter => parameter.name.text === node.text)
}

function isProjectTypeReference(node: ts.TypeReferenceNode, checker?: ts.TypeChecker) {
	if (!checker) return true

	return Array.some(
		checker.getSymbolAtLocation(node.typeName)?.declarations ?? [],
		declaration => !declaration.getSourceFile().isDeclarationFile
	)
}

function analyzeTypeAlias(
	node: ts.TypeAliasDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (ts.isTypeLiteralNode(node.type)) {
		return report(node.name, 'no-type-alias-for-object-shape', 'Inline type at every use site.')
	}

	if (ts.isFunctionTypeNode(node.type)) {
		return report(node.name, 'no-function-signature-type-alias', 'Inline type at every use site.')
	}

	report(node.name, 'no-single-use-type', 'Inline local type alias or remove annotation.')
}

function analyzeNamespaceDeclaration(
	node: ts.ModuleDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (!(node.body && ts.isModuleBlock(node.body))) return

	if (hasDeclareModifier(node) && hasCompanionValue(node)) return

	Array.forEach(node.body.statements, statement => {
		if (
			(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
			statement.name.text === 'Props'
		) {
			report(statement.name, 'no-namespace-props-type', 'Inline namespace Props type into component parameter.')
		}

		if (ts.isTypeAliasDeclaration(statement) && ts.isFunctionTypeNode(statement.type)) {
			report(statement.name, 'no-namespace-callback-alias', 'Inline namespace type at every use site.')
		}

		if (
			(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
			statement.name.text !== 'Props'
		) {
			report(statement.name, 'no-local-namespace-type', 'Inline namespace type at every use site.')
		}
	})
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
	if (!(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent))) return
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
	if (!(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent))) return

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
		Array.some(
			node.declarationList.declarations,
			declaration =>
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === name &&
				!!declaration.initializer &&
				isSchemaExpression(declaration.initializer)
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
	return Array.some(node.modifiers ?? [], modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)
}

function hasExportModifier(node: ts.ModuleDeclaration) {
	return Array.some(node.modifiers ?? [], modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

function hasCompanionValue(node: ts.ModuleDeclaration) {
	return (
		ts.isIdentifier(node.name) &&
		(ts.isSourceFile(node.parent) || ts.isModuleBlock(node.parent)) &&
		Array.some(
			node.parent.statements,
			statement =>
				(ts.isFunctionDeclaration(statement) && statement.name?.text === node.name.text) ||
				(ts.isVariableStatement(statement) &&
					Array.some(
						statement.declarationList.declarations,
						declaration => ts.isIdentifier(declaration.name) && declaration.name.text === node.name.text
					))
		)
	)
}
