import {Array, Option, pipe} from 'effect'

import ts from 'typescript'

import {
	assignmentOperators,
	comparisonOperators,
	isJsxLike,
	isLengthCheck,
	isNullishExpression,
	isUppercaseIdentifier
} from '#lib/utils.ts'

export const controlFlowRules = [
	{
		name: 'control-flow-rules',
		apply(
			node: ts.Node,
			_references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			checker?: ts.TypeChecker
		) {
			if (ts.isVariableStatement(node) && isTopLevelMutableStatement(node)) {
				report(
					node.declarationList,
					'no-top-level-mutable-singleton',
					'Do not keep mutable file-scope state. Pass state through explicit values so behavior stays statically analyzable.'
				)
			}

			if ((ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node)) {
				report(node, 'no-type-assertion', 'Remove `as` assertion. Inline, simplify, rewrite until inference works.')
			}

			if (node.kind === ts.SyntaxKind.NullKeyword && !isAllowedJsxNull(node)) {
				report(
					node,
					'no-null-literal',
					'Do not use `null`. Use absence with Option, omitted values, or bare return; only JSX empty branches may use null.'
				)
			}

			if (ts.isReturnStatement(node) && node.expression && isNullishExpression(node.expression)) {
				report(
					node.expression,
					'no-return-undefined-null',
					'Do not return `undefined` or `null` explicitly for an empty branch. Use bare `return` instead so the control flow says stop here without redundant sentinel values.'
				)
			}

			if (ts.isBinaryExpression(node) && assignmentOperators.has(node.operatorToken.kind)) {
				report(
					node.operatorToken,
					'no-mutation',
					'This assignment mutates existing state. Return a new value so data flow stays explicit.'
				)
			}

			if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
				report(
					node,
					'no-imperative-array-transform',
					'This imperative loop hides an array transform. Replace it with a pipe using Array.filter, Array.map, or Array.flatMap.'
				)
			}

			if (ts.isIfStatement(node) && node.elseStatement) {
				report(
					node.elseStatement,
					'no-else',
					'Remove the else branch. Use an early return so control flow stays flat and visible.'
				)
			}

			if (ts.isBinaryExpression(node)) {
				analyzeBinaryExpression(node, report, checker)
			}

			if (checker && ts.isPropertyAccessExpression(node)) {
				analyzeOptionalAccess(node, report, checker)
			}

			if (checker && ts.isElementAccessExpression(node)) {
				analyzeOptionalAccess(node, report, checker)
			}

			if (checker && ts.isCallExpression(node)) {
				analyzeCallExpression(node, report, checker)
			}

			if (checker && ts.isNonNullExpression(node)) {
				analyzeNonNullExpression(node, report, checker)
			}

			if (checker && ts.isPrefixUnaryExpression(node)) {
				analyzePrefixUnaryExpression(node, report, checker)
			}

			if (ts.isConditionalExpression(node)) {
				analyzeConditionalExpression(node, report)
			}
		}
	}
]

function analyzeBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
) {
	if (comparisonOperators.has(node.operatorToken.kind) && isLengthCheck(node)) {
		report(
			node,
			'no-length-check',
			'Do not write manual checks with `.length`. Replace this with the matching String or Array helper so the intent is explicit and consistent.'
		)
	}

	if (!checker) {
		return
	}

	analyzeNullishBinaryExpression(node, report, checker)
	analyzeNullishCoalescingExpression(node, report, checker)
	analyzeNullishCoalescingAssignment(node, report, checker)
	analyzeTypeofBinaryExpression(node, report, checker)
	analyzeInstanceofExpression(node, report, checker)
	analyzeInExpression(node, report, checker)
}

function isConstAssertion(node: ts.AsExpression) {
	return ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'
}

function analyzeOptionalAccess(
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (!node.questionDotToken || isAnyOrUnknown(checker.getTypeAtLocation(node.expression))) {
		return
	}

	if (isNonNullableType(checker.getTypeAtLocation(node.expression), checker)) {
		reportRedundantTypeCheck(
			node.questionDotToken,
			report,
			'Optional access checks for nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzeCallExpression(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	analyzeOptionalCall(node, report, checker)
	analyzeArrayIsArrayCall(node, report, checker)
}

function analyzeOptionalCall(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (!node.questionDotToken || isAnyOrUnknown(checker.getTypeAtLocation(node.expression))) {
		return
	}

	if (isNonNullableType(checker.getTypeAtLocation(node.expression), checker)) {
		reportRedundantTypeCheck(
			node.questionDotToken,
			report,
			'Optional call checks for nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzeArrayIsArrayCall(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		pipe(node.arguments, Array.length) !== 1 ||
		!ts.isPropertyAccessExpression(node.expression) ||
		node.expression.expression.getText() !== 'Array' ||
		node.expression.name.text !== 'isArray'
	) {
		return
	}

	const type = checker.getTypeAtLocation(pipe(node.arguments, Array.head, Option.getOrThrow))

	if (isAnyOrUnknown(type)) {
		return
	}

	if (isAlwaysArrayType(type, checker) || isAlwaysNonArrayType(type, checker)) {
		reportRedundantTypeCheck(node, report, 'Array.isArray checks a shape that the TypeScript type already proves.')
	}
}

function analyzeNonNullExpression(
	node: ts.NonNullExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const type = checker.getTypeAtLocation(node.expression)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Non-null assertion repeats nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzePrefixUnaryExpression(
	node: ts.PrefixUnaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operator !== ts.SyntaxKind.ExclamationToken) {
		return
	}

	const type = checker.getTypeAtLocation(node.operand)

	if (!isAnyOrUnknown(type) && isAlwaysTruthy(type)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Truthiness check is impossible because the TypeScript type excludes every falsy value.'
		)
	}
}

function analyzeNullishBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const checked = checkedNullishSide(node)

	if (!checked || isAnyOrUnknown(checker.getTypeAtLocation(checked.expression))) {
		return
	}

	if (
		isNonNullableType(checker.getTypeAtLocation(checked.expression), checker) ||
		isAlwaysCheckedNullish(checker.getTypeAtLocation(checked.expression), checked.nullish)
	) {
		reportRedundantTypeCheck(
			node,
			report,
			'Nullish comparison checks a state that the TypeScript type already excludes.'
		)
	}
}

function analyzeNullishCoalescingAssignment(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionEqualsToken) {
		return
	}

	const type = checker.getTypeAtLocation(node.left)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node.operatorToken,
			report,
			'Nullish assignment fallback is unreachable because the TypeScript type already excludes nullish state.'
		)
	}
}

function analyzeNullishCoalescingExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) {
		return
	}

	const type = checker.getTypeAtLocation(node.left)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node.operatorToken,
			report,
			'Nullish fallback is unreachable because the TypeScript type already excludes nullish state.'
		)
	}
}

function analyzeTypeofBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const check = typeofCheck(node)

	if (!check || isAnyOrUnknown(checker.getTypeAtLocation(check.expression))) {
		return
	}

	if (
		isAlwaysTypeof(checker.getTypeAtLocation(check.expression), check.kind) ||
		isNeverTypeof(checker.getTypeAtLocation(check.expression), check.kind)
	) {
		reportRedundantTypeCheck(
			node,
			report,
			'Runtime typeof check repeats information already known by the TypeScript type.'
		)
	}
}

function analyzeInstanceofExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		node.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword ||
		isAnyOrUnknown(checker.getTypeAtLocation(node.left))
	) {
		return
	}

	const instanceType = instanceTypeOf(node.right, checker)

	if (instanceType && isAlwaysAssignableTo(checker.getTypeAtLocation(node.left), instanceType, checker)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Runtime instanceof check repeats information already known by the TypeScript type.'
		)
	}
}

function analyzeInExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		node.operatorToken.kind !== ts.SyntaxKind.InKeyword ||
		!(ts.isStringLiteral(node.left) || ts.isNoSubstitutionTemplateLiteral(node.left)) ||
		isAnyOrUnknown(checker.getTypeAtLocation(node.right))
	) {
		return
	}

	if (hasRequiredProperty(checker.getTypeAtLocation(node.right), node.left.text)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Property existence check repeats a required property already known by the TypeScript type.'
		)
	}
}

function analyzeConditionalExpression(
	node: ts.ConditionalExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		(isJsxLike(node.whenTrue) && isNullishExpression(node.whenFalse)) ||
		(isJsxLike(node.whenFalse) && isNullishExpression(node.whenTrue))
	) {
		report(
			node,
			'no-ternary-in-jsx',
			'When one branch is empty, use condition && <...> instead of a ternary with null or undefined.'
		)
	}
}

function isAllowedJsxNull(node: ts.Node) {
	return (
		(ts.isConditionalExpression(node.parent) &&
			(isJsxLike(node.parent.whenTrue) || isJsxLike(node.parent.whenFalse))) ||
		(ts.isJsxExpression(node.parent) && node.parent.expression === node) ||
		isJsonStringifyReplacer(node) ||
		isInsideUseRefCall(node) ||
		isComponentEmptyReturn(node)
	)
}

function isJsonStringifyReplacer(node: ts.Node) {
	return (
		ts.isCallExpression(node.parent) &&
		node.parent.arguments[1] === node &&
		ts.isPropertyAccessExpression(node.parent.expression) &&
		node.parent.expression.expression.getText() === 'JSON' &&
		node.parent.expression.name.text === 'stringify'
	)
}

function isInsideUseRefCall(node: ts.Node) {
	return !!ts.findAncestor(
		node,
		element =>
			ts.isCallExpression(element) &&
			element.expression.getText() === 'useRef' &&
			element.pos <= node.pos &&
			node.end <= element.end
	)
}

function isComponentEmptyReturn(node: ts.Node) {
	return !!ts.findAncestor(
		node,
		element =>
			ts.isReturnStatement(element) &&
			element.expression === node &&
			!!ts.findAncestor(
				element,
				ancestor => ts.isFunctionDeclaration(ancestor) && !!ancestor.name && isUppercaseIdentifier(ancestor.name)
			)
	)
}

function checkedNullishSide(node: ts.BinaryExpression) {
	if (!isNullishComparisonOperator(node.operatorToken.kind)) {
		return
	}

	if (isNullishExpression(node.left)) {
		return {expression: node.right, nullish: node.left}
	}

	if (isNullishExpression(node.right)) {
		return {expression: node.left, nullish: node.right}
	}
}

function isNullishComparisonOperator(kind: ts.SyntaxKind) {
	return (
		kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
		kind === ts.SyntaxKind.EqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsToken
	)
}

function typeofCheck(node: ts.BinaryExpression) {
	if (!isNullishComparisonOperator(node.operatorToken.kind)) {
		return
	}

	if (ts.isTypeOfExpression(node.left) && ts.isStringLiteralLike(node.right)) {
		return {expression: node.left.expression, kind: node.right.text}
	}

	if (ts.isTypeOfExpression(node.right) && ts.isStringLiteralLike(node.left)) {
		return {expression: node.right.expression, kind: node.left.text}
	}
}

function reportRedundantTypeCheck(
	node: ts.Node,
	report: (node: ts.Node, rule: string, message: string) => void,
	message: string
) {
	report(node, 'no-redundant-type-check', message)
}

function isAnyOrUnknown(type: ts.Type) {
	return hasTypeFlag(type, ts.TypeFlags.Any) || hasTypeFlag(type, ts.TypeFlags.Unknown)
}

function isNonNullableType(type: ts.Type, _checker: ts.TypeChecker) {
	return !(
		hasTypeFlag(type, ts.TypeFlags.Null) ||
		hasTypeFlag(type, ts.TypeFlags.Undefined) ||
		hasTypeFlag(type, ts.TypeFlags.Void)
	)
}

function hasTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
	return type.isUnion() ? type.types.some(part => hasTypeFlag(part, flag)) : (type.flags & flag) !== 0
}

function typeParts(type: ts.Type) {
	return type.isUnion() ? type.types : [type]
}

function isAlwaysArrayType(type: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(part => checker.isArrayType(part) || checker.isTupleType(part))
}

function isAlwaysNonArrayType(type: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(
		part => !(checker.isArrayType(part) || checker.isTupleType(part)) && isPrimitiveType(part)
	)
}

function isPrimitiveType(type: ts.Type) {
	return (
		(type.flags & ts.TypeFlags.StringLike) !== 0 ||
		(type.flags & ts.TypeFlags.NumberLike) !== 0 ||
		(type.flags & ts.TypeFlags.BooleanLike) !== 0 ||
		(type.flags & ts.TypeFlags.BigIntLike) !== 0 ||
		(type.flags & ts.TypeFlags.ESSymbolLike) !== 0 ||
		(type.flags & ts.TypeFlags.Null) !== 0 ||
		(type.flags & ts.TypeFlags.Undefined) !== 0
	)
}

function isAlwaysTypeof(type: ts.Type, kind: string) {
	return typeParts(type).every(part => isTypeofKind(part, kind))
}

function isNeverTypeof(type: ts.Type, kind: string) {
	return typeParts(type).every(part => isPrimitiveType(part) && !isTypeofKind(part, kind))
}

function isTypeofKind(type: ts.Type, kind: string) {
	if (kind === 'string') {
		return (type.flags & ts.TypeFlags.StringLike) !== 0
	}

	if (kind === 'number') {
		return (type.flags & ts.TypeFlags.NumberLike) !== 0
	}

	if (kind === 'boolean') {
		return (type.flags & ts.TypeFlags.BooleanLike) !== 0
	}

	if (kind === 'bigint') {
		return (type.flags & ts.TypeFlags.BigIntLike) !== 0
	}

	if (kind === 'symbol') {
		return (type.flags & ts.TypeFlags.ESSymbolLike) !== 0
	}

	if (kind === 'undefined') {
		return (type.flags & ts.TypeFlags.Undefined) !== 0
	}

	if (kind === 'function') {
		return Array.isReadonlyArrayNonEmpty(type.getCallSignatures())
	}

	return false
}

function instanceTypeOf(node: ts.Expression, checker: ts.TypeChecker) {
	return pipe(
		checker.getTypeAtLocation(node).getConstructSignatures(),
		Array.head,
		Option.map(signature => signature.getReturnType()),
		Option.getOrUndefined
	)
}

function isAlwaysAssignableTo(type: ts.Type, target: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(part => checker.isTypeAssignableTo(part, target))
}

function hasRequiredProperty(type: ts.Type, propertyName: string) {
	return typeParts(type).every(part => {
		const property = part.getProperty(propertyName)

		return !!property && (property.flags & ts.SymbolFlags.Optional) === 0
	})
}

function isAlwaysCheckedNullish(type: ts.Type, expression: ts.Expression) {
	if (expression.kind === ts.SyntaxKind.NullKeyword) {
		return typeParts(type).every(part => (part.flags & ts.TypeFlags.Null) !== 0)
	}

	if (ts.isIdentifier(expression) && expression.text === 'undefined') {
		return typeParts(type).every(part => (part.flags & ts.TypeFlags.Undefined) !== 0)
	}

	return typeParts(type).every(
		part => (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0
	)
}

function isAlwaysTruthy(type: ts.Type) {
	return typeParts(type).every(
		part =>
			(part.flags & ts.TypeFlags.BooleanLiteral) === 0 &&
			(part.flags & ts.TypeFlags.NumberLiteral) === 0 &&
			(part.flags & ts.TypeFlags.StringLiteral) === 0 &&
			(part.flags & ts.TypeFlags.BigIntLiteral) === 0 &&
			(part.flags & ts.TypeFlags.Null) === 0 &&
			(part.flags & ts.TypeFlags.Undefined) === 0 &&
			(part.flags & ts.TypeFlags.BooleanLike) === 0 &&
			(part.flags & ts.TypeFlags.NumberLike) === 0 &&
			(part.flags & ts.TypeFlags.StringLike) === 0 &&
			(part.flags & ts.TypeFlags.BigIntLike) === 0
	)
}

function isTopLevelMutableStatement(node: ts.VariableStatement) {
	return node.parent.kind === ts.SyntaxKind.SourceFile && (node.declarationList.flags & ts.NodeFlags.Let) !== 0
}
