import {Array, pipe, String} from 'effect'

import ts from 'typescript'

export function isConstAssertion(node: ts.Node) {
	return (
		ts.isAsExpression(node) &&
		ts.isTypeReferenceNode(node.type) &&
		ts.isIdentifier(node.type.typeName) &&
		node.type.typeName.text === 'const'
	)
}

export function hasModifier(node: {readonly modifiers?: ts.NodeArray<ts.ModifierLike>}, kind: ts.SyntaxKind) {
	return Array.some(node.modifiers ?? [], modifier => modifier.kind === kind)
}

export function callName(node: ts.CallExpression) {
	if (ts.isIdentifier(node.expression)) return node.expression.text
	if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text
	return ''
}

export function isHookCall(node: ts.Node): node is ts.CallExpression {
	return ts.isCallExpression(node) && String.match(/^use[A-Z0-9]/)(callName(node))._tag === 'Some'
}

export function isEffectCall(
	node: ts.Node
): node is ts.CallExpression & {readonly expression: ts.PropertyAccessExpression} {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect'
	)
}

export function isEffectConstructorCall(node: ts.Node) {
	return (
		isEffectCall(node) &&
		Array.contains(
			['fnUntraced', 'gen', 'succeed', 'fail', 'sync', 'promise', 'try', 'tryPromise'] as const,
			callName(node)
		)
	)
}

export function isImportedIdentifier(
	checker: ts.TypeChecker | undefined,
	node: ts.Node,
	moduleName: string,
	importedName: string
) {
	if (!(checker && ts.isIdentifier(node))) return false
	return Array.some(checker.getSymbolAtLocation(node)?.declarations ?? [], declaration => {
		if (
			ts.isImportSpecifier(declaration) &&
			ts.isStringLiteral(declaration.parent.parent.parent.moduleSpecifier) &&
			declaration.parent.parent.parent.moduleSpecifier.text === moduleName
		) {
			return (declaration.propertyName ?? declaration.name).text === importedName
		}
		if (
			ts.isNamespaceImport(declaration) &&
			ts.isStringLiteral(declaration.parent.parent.moduleSpecifier) &&
			declaration.parent.parent.moduleSpecifier.text === moduleName
		) {
			return declaration.name.text === importedName
		}
		return false
	})
}

export function isAtomConstructorCall(checker: ts.TypeChecker | undefined, node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		isImportedIdentifier(checker, node.expression.expression, 'effect/unstable/reactivity', 'Atom') &&
		Array.contains(['family', 'make'] as const, node.expression.name.text)
	)
}

export function isRcMapConstructorCall(checker: ts.TypeChecker | undefined, node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		isImportedIdentifier(checker, node.expression.expression, 'effect', 'RcMap') &&
		node.expression.name.text === 'make'
	)
}

export function isEffectGenLikeCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect' &&
		Array.contains(['gen', 'fnUntraced'] as const, node.expression.name.text)
	)
}

export function isPipeCall(node: ts.Node): node is ts.CallExpression & {readonly expression: ts.Identifier} {
	return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'pipe'
}

export function isFlowCall(node: ts.Node): node is ts.CallExpression & {readonly expression: ts.Identifier} {
	return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'flow'
}

export function isMatchCall(node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Match'
	)
}

export function isSchemaExpression(node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		((ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'Schema') ||
			(ts.isIdentifier(node.expression) && String.endsWith('Schema')(node.expression.text)))
	)
}

export function isReactHookTupleCall(node: ts.Node) {
	return isHookCall(node)
}

export function isLiteral(node: ts.Node) {
	return (
		ts.isStringLiteralLike(node) ||
		ts.isNumericLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	)
}

export function isLiteralContainer(node: ts.Node) {
	return ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)
}

export function isAccessExpression(node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
	return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
}

export function isCheapExpression(node: ts.Expression): boolean {
	if (ts.isIdentifier(node) || isAccessExpression(node) || isLiteral(node)) return true
	if (ts.isNonNullExpression(node)) return isCheapExpression(node.expression)
	if (ts.isParenthesizedExpression(node)) return isCheapExpression(node.expression)
	if (ts.isNoSubstitutionTemplateLiteral(node)) return true
	if (ts.isTemplateExpression(node)) {
		return Array.every(node.templateSpans, span => isCheapExpression(span.expression))
	}
	if (ts.isBinaryExpression(node)) return isCheapExpression(node.left) && isCheapExpression(node.right)
	if (ts.isPrefixUnaryExpression(node)) return isCheapExpression(node.operand)
	if (ts.isConditionalExpression(node)) {
		return isCheapExpression(node.condition) && isCheapExpression(node.whenTrue) && isCheapExpression(node.whenFalse)
	}
	return (
		ts.isCallExpression(node) &&
		(ts.isPropertyAccessExpression(node.expression) || ts.isIdentifier(node.expression)) &&
		Array.length(node.arguments) <= 2 &&
		Array.every(node.arguments, argument => ts.isExpression(argument) && isCheapExpression(argument))
	)
}

export function isBooleanExpression(node: ts.Expression) {
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return true
	if (ts.isBinaryExpression(node)) {
		return Array.contains(
			[
				ts.SyntaxKind.EqualsEqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsEqualsToken,
				ts.SyntaxKind.EqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsToken,
				ts.SyntaxKind.AmpersandAmpersandToken,
				ts.SyntaxKind.BarBarToken,
				ts.SyntaxKind.GreaterThanToken,
				ts.SyntaxKind.GreaterThanEqualsToken,
				ts.SyntaxKind.LessThanToken,
				ts.SyntaxKind.LessThanEqualsToken,
				ts.SyntaxKind.InKeyword,
				ts.SyntaxKind.InstanceOfKeyword
			] as const,
			node.operatorToken.kind
		)
	}
	return false
}

export function containsNode(node: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
	return predicate(node) || !!ts.forEachChild(node, child => (containsNode(child, predicate) ? true : undefined))
}

export function typeIncludesNullish(type: ts.Type) {
	if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return true
	return type.isUnion() && Array.some(type.types, typeIncludesNullish)
}

export function typeLooksEffect(checker: ts.TypeChecker | undefined, node: ts.Node) {
	return checker ? String.includes('Effect<')(checker.typeToString(checker.getTypeAtLocation(node))) : false
}

export function typeLooksReadonlyArray(checker: ts.TypeChecker | undefined, node: ts.Node) {
	return checker ? String.includes('ReadonlyArray<')(checker.typeToString(checker.getTypeAtLocation(node))) : false
}

export function bindingNames(name: ts.BindingName): readonly ts.Identifier[] {
	if (ts.isIdentifier(name)) return [name]
	return Array.flatMap(name.elements, element => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)))
}

export function declarationName(node: ts.Node) {
	if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name) {
		return node.name.text
	}
	if (ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
		return node.name.text
	}
	if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text
	return '<root>'
}

export function previousStatement(node: ts.Statement) {
	if (!(ts.isSourceFile(node.parent) || ts.isBlock(node.parent) || ts.isModuleBlock(node.parent))) return
	for (let index = 0; index < Array.length(node.parent.statements); index += 1) {
		if (node.parent.statements[index] === node) return node.parent.statements[index - 1]
	}
}

export function returnedExpression(node: ts.FunctionLikeDeclaration) {
	if (!node.body) return
	if (!ts.isBlock(node.body)) return node.body
	if (Array.length(node.body.statements) !== 1) return
	if (node.body.statements[0] && ts.isReturnStatement(node.body.statements[0])) {
		return node.body.statements[0].expression
	}
}

export function isTerminalStatement(node: ts.Statement) {
	return (
		ts.isReturnStatement(node) || ts.isThrowStatement(node) || ts.isContinueStatement(node) || ts.isBreakStatement(node)
	)
}

export function normalizedText(node: ts.Node) {
	return pipe(node.getText(node.getSourceFile()), String.replace(/\s+/g, ' '), String.trim)
}
