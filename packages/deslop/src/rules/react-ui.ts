import {Array} from 'effect'

import ts from 'typescript'

import {containsNode} from '#lib/ts.ts'
import type {Rule} from './helpers.ts'
import {isAllowedCallableValue, isAssignmentOperator, isReactRefCurrent, isReactUseStateCall, rule} from './helpers.ts'

export const reactUiRules = [
	rule('prefer-function-declaration', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (!(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return
		if (isAllowedCallableValue(node.initializer)) return
		context.report(
			node.name,
			'prefer-function-declaration',
			`"${node.name.text}" stores a named function in a variable. Rewrite it as a function declaration and keep arrow functions for inline callbacks only.`
		)
	}),
	rule('prefer-arrow-callback', (node, context) => {
		if (!(ts.isFunctionExpression(node) && ts.isCallExpression(node.parent)) || node.asteriskToken) return
		context.report(
			node,
			'prefer-arrow-callback',
			'This callback uses a function expression. Rewrite it as an arrow callback unless it is a generator callback required by Effect.'
		)
	}),
	rule('no-react-manual-memoization', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			Array.contains(['memo', 'useMemo', 'useCallback'] as const, node.expression.text)
		) {
			context.report(
				node.expression,
				'no-react-manual-memoization',
				`"${node.expression.text}" adds manual React memoization. Remove the memoization call and keep the underlying value or component.`
			)
		}
	}),
	rule('no-react-forward-ref', (node, context) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'forwardRef') {
			context.report(
				node.expression,
				'no-react-forward-ref',
				'forwardRef is unnecessary. Accept ref through normal props and remove the wrapper.'
			)
		}
	}),
	rule('no-react-use-state-lazy-initializer', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			isReactUseStateCall(context.checker, node) &&
			node.arguments[0] &&
			(ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
		) {
			context.report(
				node.arguments[0],
				'no-react-use-state-lazy-initializer',
				'This useState lazy initializer adds manual render caching. Move the initializer to a plain const and let the React compiler memoize it.'
			)
		}
	}),
	rule('prefer-composition-over-render-branching', (node, context) => {
		if (
			ts.isConditionalExpression(node) &&
			(containsNode(node.whenTrue, ts.isJsxElement) || containsNode(node.whenTrue, ts.isJsxSelfClosingElement)) &&
			(containsNode(node.whenFalse, ts.isJsxElement) || containsNode(node.whenFalse, ts.isJsxSelfClosingElement))
		) {
			context.report(
				node,
				'prefer-composition-over-render-branching',
				'This render branches between component trees. Extract stable components and pass variant data instead of switching entire trees inline.'
			)
		}
	}),
	rule('no-property-mutation-outside-ref-current', (node, context) => {
		if (
			ts.isBinaryExpression(node) &&
			isAssignmentOperator(node.operatorToken.kind) &&
			!isReactRefCurrent(context.checker, node.left) &&
			!ts.isIdentifier(node.left) &&
			!(
				ts.isPropertyAccessExpression(node.left) &&
				ts.isIdentifier(node.left.expression) &&
				RegExp('^[A-Z]').test(node.left.name.text) &&
				isComponentValue(context.checker, node.left.expression) &&
				(ts.isArrowFunction(node.right) ||
					ts.isFunctionExpression(node.right) ||
					ts.isClassExpression(node.right) ||
					isComponentValue(context.checker, node.right))
			)
		) {
			context.report(
				node.operatorToken,
				'no-property-mutation-outside-ref-current',
				'This writes to a property outside ref.current. Derive a new value and pass it once, or move the mutation behind an explicit ref boundary.'
			)
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			Array.contains(['push', 'pop', 'splice', 'set', 'add', 'delete', 'clear'] as const, node.expression.name.text) &&
			!isReactRefCurrent(context.checker, node.expression.expression) &&
			!ts.isIdentifier(node.expression.expression)
		) {
			context.report(
				node.expression.name,
				'no-property-mutation-outside-ref-current',
				'This mutates a collection outside ref.current. Replace it with an immutable update, or move the mutation behind an explicit ref boundary.'
			)
		}
	})
] as const satisfies readonly Rule[]

function isComponentValue(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!checker) return false
	return Array.some(checker.getSymbolAtLocation(node)?.declarations ?? [], declaration => {
		return (
			ts.isFunctionDeclaration(declaration) ||
			ts.isClassDeclaration(declaration) ||
			(ts.isVariableDeclaration(declaration) &&
				!!declaration.initializer &&
				(ts.isArrowFunction(declaration.initializer) ||
					ts.isFunctionExpression(declaration.initializer) ||
					ts.isClassExpression(declaration.initializer)))
		)
	})
}
