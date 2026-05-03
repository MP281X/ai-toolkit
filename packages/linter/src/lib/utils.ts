import {Array, Option, pipe, String} from 'effect'

import ts from 'typescript'

export const transformPrototypeMethods = new Set([
	'at',
	'charAt',
	'charCodeAt',
	'codePointAt',
	'concat',
	'endsWith',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flat',
	'flatMap',
	'forEach',
	'indexOf',
	'join',
	'match',
	'matchAll',
	'map',
	'normalize',
	'padEnd',
	'padStart',
	'repeat',
	'reduce',
	'reduceRight',
	'replace',
	'replaceAll',
	'search',
	'sort',
	'split',
	'substring',
	'toLowerCase',
	'toSorted',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart'
])

export const effectModuleNames = new Set([
	'Array',
	'Cause',
	'Chunk',
	'Duration',
	'Either',
	'Effect',
	'Exit',
	'Fiber',
	'Layer',
	'Match',
	'Option',
	'Record',
	'Schedule',
	'Schema',
	'SchemaTransformation',
	'Stream',
	'String'
])

export const mutationPrototypeMethods = new Set([
	'copyWithin',
	'fill',
	'pop',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift'
])
export const reactCompilerFunctions = new Set(['forwardRef', 'memo', 'useCallback', 'useMemo'])
export const tailwindTokenPattern =
	/(?:^|\s)(?:flex|grid|block|inline|hidden|items-|justify-|gap-|p[trblxy]?-|m[trblxy]?-|text-|bg-|border|rounded|size-|h-|w-|min-|max-|font-|leading-|tracking-|shadow|opacity-|z-|absolute|relative|fixed|sticky)(?:\s|$)/

export const assignmentOperators = new Set([
	ts.SyntaxKind.FirstAssignment,
	ts.SyntaxKind.PlusEqualsToken,
	ts.SyntaxKind.MinusEqualsToken,
	ts.SyntaxKind.AsteriskEqualsToken,
	ts.SyntaxKind.AsteriskAsteriskEqualsToken,
	ts.SyntaxKind.SlashEqualsToken,
	ts.SyntaxKind.PercentEqualsToken,
	ts.SyntaxKind.LessThanLessThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.AmpersandEqualsToken,
	ts.SyntaxKind.BarEqualsToken,
	ts.SyntaxKind.CaretEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken
])

export const comparisonOperators = new Set([
	ts.SyntaxKind.EqualsEqualsEqualsToken,
	ts.SyntaxKind.EqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsToken,
	ts.SyntaxKind.GreaterThanToken,
	ts.SyntaxKind.GreaterThanEqualsToken,
	ts.SyntaxKind.LessThanToken,
	ts.SyntaxKind.LessThanEqualsToken,
	ts.SyntaxKind.InKeyword,
	ts.SyntaxKind.InstanceOfKeyword
])

export function isAccessExpression(node: ts.Expression) {
	return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
}

export function isPrimitiveLiteral(node: ts.Expression) {
	return (
		ts.isStringLiteral(node) ||
		ts.isNumericLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword
	)
}

export function isTailwindStringLiteral(node: ts.Expression) {
	return ts.isStringLiteralLike(node) && tailwindTokenPattern.test(node.text)
}

export function isNullishExpression(node: ts.Expression) {
	return (
		node.kind === ts.SyntaxKind.NullKeyword ||
		(ts.isIdentifier(node) && node.text === 'undefined') ||
		node.kind === ts.SyntaxKind.VoidExpression
	)
}

export function isJsxLike(node: ts.Expression) {
	return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)
}

export function isUppercaseIdentifier(node: ts.Node) {
	return (
		ts.isIdentifier(node) &&
		pipe(node.text, String.length) > 0 &&
		pipe(
			Option.fromUndefinedOr(node.text[0]),
			Option.exists(character => character === pipe(character, String.toUpperCase))
		)
	)
}

export function getSingleReturnedExpression(node: ts.FunctionLikeDeclaration) {
	if (node.body && ts.isExpression(node.body)) {
		return node.body
	}

	if (!(node.body && ts.isBlock(node.body) && Array.isReadonlyArrayNonEmpty(node.body.statements))) {
		return
	}

	const [statement] = node.body.statements

	if (ts.isReturnStatement(statement) && statement.expression) {
		return statement.expression
	}
}

export function isEffectGenCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'gen' &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect'
	)
}

export function isPassThroughCall(node: ts.FunctionLikeDeclaration, expression: ts.CallExpression) {
	return (
		node.parameters.length === expression.arguments.length &&
		pipe(
			expression.arguments,
			Array.every((argument, index) =>
				pipe(
					Option.fromUndefinedOr(node.parameters[index]),
					Option.exists(
						parameter =>
							ts.isIdentifier(argument) && ts.isIdentifier(parameter.name) && argument.text === parameter.name.text
					)
				)
			)
		)
	)
}

export function isCallShapeAdapter(expression: ts.CallExpression) {
	return pipe(
		expression.arguments,
		Array.some(
			argument =>
				ts.isObjectLiteralExpression(argument) &&
				pipe(
					argument.properties,
					Array.some(property => ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property))
				)
		)
	)
}

export function isBranchGrowingHelper(node: ts.FunctionLikeDeclaration) {
	return node.body ? hasBranch(node.body) : false
}

function hasBranch(node: ts.Node): boolean {
	return ts.isIfStatement(node) || !!ts.forEachChild(node, child => (hasBranch(child) ? true : undefined))
}

export function hasDefaultParameter(node: ts.FunctionLikeDeclaration) {
	return pipe(
		node.parameters,
		Array.some(parameter => !!parameter.initializer)
	)
}

export function isNamedArrowOrFunctionExpression(node: ts.FunctionLikeDeclaration) {
	return (
		(ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
		ts.isVariableDeclaration(node.parent) &&
		ts.isIdentifier(node.parent.name)
	)
}

export function isLengthAccess(node: ts.Expression) {
	return ts.isPropertyAccessExpression(node) && node.name.text === 'length'
}

export function isZeroOrOne(node: ts.Expression) {
	return ts.isNumericLiteral(node) && (node.text === '0' || node.text === '1')
}

export function isLengthCheck(node: ts.BinaryExpression) {
	return (
		(isLengthAccess(node.left) && isZeroOrOne(node.right)) || (isZeroOrOne(node.left) && isLengthAccess(node.right))
	)
}

export function isNullishBinaryCheck(node: ts.BinaryExpression) {
	return (
		pipe(
			[
				ts.SyntaxKind.EqualsEqualsEqualsToken,
				ts.SyntaxKind.EqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsToken
			],
			Array.contains(node.operatorToken.kind)
		) &&
		(isNullishExpression(node.left) || isNullishExpression(node.right))
	)
}

export function functionReturnsJsx(node: ts.FunctionLikeDeclaration) {
	return pipe(getSingleReturnedExpression(node), Option.fromUndefinedOr, Option.exists(isJsxLike))
}
