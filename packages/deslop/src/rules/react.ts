import {Array, String} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {isAssignmentOperator, isReactRefCurrent, isReactUseStateCall, isTailwindStringLiteral, rule} from './helpers.ts'

import {isHookCall, normalizedText} from '#lib/ts.ts'

export const reactRules = [
	rule('no-jsx-props-object', (node, context) => {
		if (!ts.isJsxSpreadAttribute(node)) return
		context.report(node, 'no-jsx-props-object', {
			description: `JSX spread "${normalizedText(node.expression)}" hides rendered props.`,
			fix: 'Replace the spread with explicit JSX attributes for each prop.'
		})
	}),
	rule('no-tailwind-class-indirection', (node, context) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cva') {
			context.report(node.expression, 'no-tailwind-class-indirection', {
				description: 'cva hides Tailwind classes from JSX.',
				fix: 'Keep class strings on JSX elements; use cn(...) inline only for conditional classes.'
			})
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			isTailwindStringLiteral(node.initializer)
		) {
			context.report(node.name, 'no-tailwind-class-indirection', {
				description: `Class binding "${node.name.text}" hides Tailwind classes.`,
				fix: `Inline "${normalizedText(node.initializer)}" into className and delete this binding.`
			})
		}
	}),
	rule('no-manual-memoization', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			Array.contains(['memo', 'useMemo', 'useCallback'] as const, node.expression.text)
		) {
			context.report(node.expression, 'no-manual-memoization', {
				description: `"${node.expression.text}" is manual React memoization.`,
				fix: 'Remove the wrapper and keep the raw value, callback, or component expression.'
			})
		}
	}),
	rule('no-forward-ref', (node, context) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'forwardRef') {
			context.report(node.expression, 'no-forward-ref', {
				description: 'forwardRef is banned.',
				fix: 'Accept ref as a normal prop, pass props.ref to the element, and remove the wrapper.'
			})
		}
	}),
	rule('no-use-state-lazy-initializer', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			isReactUseStateCall(context.checker, node) &&
			node.arguments[0] &&
			(ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
		) {
			context.report(node.arguments[0], 'no-use-state-lazy-initializer', {
				description: `useState lazy initializer "${normalizedText(node.arguments[0])}" is banned.`,
				fix: 'Pass the initial value directly; compute it in a const first if needed.'
			})
		}
	}),
	rule('prefer-hook-variable', (node, context) => {
		if (!/\.tsx$/.test(context.filePath)) return
		if (!isHookCall(node)) return
		if (ts.isExpressionStatement(node.parent)) return
		if (
			ts.isVariableDeclaration(node.parent) &&
			node.parent.initializer === node &&
			(ts.isIdentifier(node.parent.name) || ts.isArrayBindingPattern(node.parent.name))
		) {
			return
		}
		context.report(node, 'prefer-hook-variable', {
			description: `Hook call "${normalizedText(node)}" is inline.`,
			fix: 'Hoist it to a local const before this expression, then use the const.'
		})
	}),
	rule('no-jsx-variable', (node, context) => {
		if (!ts.isVariableDeclaration(node)) return
		if (!(node.initializer && isJsxValue(node.initializer))) return
		context.report(node.name, 'no-jsx-variable', {
			description: `JSX binding "${node.name.getText(context.sourceFile)}" hides render output.`,
			fix: 'Inline the JSX at the return/prop use and delete this binding.'
		})
	}),
	rule('no-property-mutation-outside-ref-current', (node, context) => {
		if (
			ts.isBinaryExpression(node) &&
			isAssignmentOperator(node.operatorToken.kind) &&
			!ts.findAncestor(node, ts.isClassLike) &&
			!isReactRefCurrent(context.checker, node.left) &&
			!isDomPropertyWrite(context.checker, node.left) &&
			!ts.isIdentifier(node.left) &&
			!(
				ts.isPropertyAccessExpression(node.left) &&
				ts.isIdentifier(node.left.expression) &&
				/^[A-Z]/.test(node.left.name.text) &&
				isComponentValue(context.checker, node.left.expression) &&
				(ts.isArrowFunction(node.right) ||
					ts.isFunctionExpression(node.right) ||
					ts.isClassExpression(node.right) ||
					isComponentValue(context.checker, node.right))
			)
		) {
			context.report(node.operatorToken, 'no-property-mutation-outside-ref-current', {
				description: `Property write "${normalizedText(node.left)}" mutates shared state.`,
				fix: 'Return a new value, assign a local variable, or move mutable state behind ref.current.'
			})
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			Array.contains(['push', 'pop', 'splice', 'set', 'add', 'delete', 'clear'] as const, node.expression.name.text) &&
			!isReactRefCurrent(context.checker, node.expression.expression) &&
			!ts.isIdentifier(node.expression.expression)
		) {
			context.report(node.expression.name, 'no-property-mutation-outside-ref-current', {
				description: `Collection mutation "${normalizedText(node.expression)}" is outside ref.current.`,
				fix: 'Use an immutable update or keep the collection behind ref.current.'
			})
		}
	})
] as const satisfies readonly Rule[]

function isComponentValue(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!checker) return false
	return Array.some(
		checker.getSymbolAtLocation(node)?.declarations ?? [],
		declaration =>
			ts.isFunctionDeclaration(declaration) ||
			ts.isClassDeclaration(declaration) ||
			(ts.isVariableDeclaration(declaration) &&
				!!declaration.initializer &&
				(ts.isArrowFunction(declaration.initializer) ||
					ts.isFunctionExpression(declaration.initializer) ||
					ts.isClassExpression(declaration.initializer)))
	)
}

function isJsxValue(node: ts.Expression): boolean {
	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
	if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
		return isJsxValue(node.expression)
	}
	if (ts.isConditionalExpression(node)) return isJsxValue(node.whenTrue) || isJsxValue(node.whenFalse)
	return false
}

function isDomPropertyWrite(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(checker && ts.isPropertyAccessExpression(node))) return false
	const receiverType = checker.typeToString(checker.getTypeAtLocation(node.expression))
	return (
		String.includes('HTMLElement')(receiverType) ||
		String.includes('HTMLCanvasElement')(receiverType) ||
		String.includes('CanvasRenderingContext2D')(receiverType) ||
		String.includes('CSSStyleDeclaration')(receiverType)
	)
}
