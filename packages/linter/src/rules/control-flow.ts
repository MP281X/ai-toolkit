import ts from 'typescript'

import {
	assignmentOperators,
	comparisonOperators,
	isJsxLike,
	isLengthCheck,
	isNullishBinaryCheck,
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
			_checker?: ts.TypeChecker
		) {
			if (ts.isVariableStatement(node) && isTopLevelMutableStatement(node)) {
				report(
					node.declarationList,
					'no-top-level-mutable-singleton',
					'Do not keep mutable file-scope state. Pass state through explicit values so behavior stays statically analyzable.'
				)
			}

			if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
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

			if (ts.isTypeOfExpression(node)) {
				report(
					node,
					'no-typeof',
					'Do not use `typeof` directly. Replace it with the matching `Predicate` helper so narrowing stays consistent with the rest of the codebase.'
				)
			}

			if (ts.isBinaryExpression(node)) {
				analyzeBinaryExpression(node, report)
			}

			if (ts.isConditionalExpression(node)) {
				analyzeConditionalExpression(node, report)
			}
		}
	}
]

function analyzeBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
		(ts.isStringLiteral(node.left) || ts.isNoSubstitutionTemplateLiteral(node.left))
	) {
		report(
			node.operatorToken,
			'no-in-operator',
			'Do not use the `in` operator. Replace it with `Predicate.hasProperty(property, object)` so property checks stay explicit and composable.'
		)
	}

	if (comparisonOperators.has(node.operatorToken.kind) && isLengthCheck(node)) {
		report(
			node,
			'no-length-check',
			'Do not write manual checks with `.length`. Replace this with the matching String or Array helper so the intent is explicit and consistent.'
		)
	}

	if (isNullishBinaryCheck(node)) {
		report(
			node,
			'no-nullish-checks',
			'Do not write manual nullish checks. Replace this with the matching Predicate helper so the intent stays explicit and consistent.'
		)
	}

	if (isUndefinedBinaryCheck(node)) {
		report(
			node,
			'no-undefined-checks',
			'Do not compare against `undefined`. Use the matching Predicate helper so optional checks stay explicit and composable.'
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

function isUndefinedBinaryCheck(node: ts.BinaryExpression) {
	return (
		[
			ts.SyntaxKind.EqualsEqualsEqualsToken,
			ts.SyntaxKind.EqualsEqualsToken,
			ts.SyntaxKind.ExclamationEqualsEqualsToken,
			ts.SyntaxKind.ExclamationEqualsToken
		].includes(node.operatorToken.kind) &&
		((ts.isIdentifier(node.left) && node.left.text === 'undefined') ||
			(ts.isIdentifier(node.right) && node.right.text === 'undefined'))
	)
}

function isTopLevelMutableStatement(node: ts.VariableStatement) {
	return node.parent.kind === ts.SyntaxKind.SourceFile && (node.declarationList.flags & ts.NodeFlags.Let) !== 0
}
