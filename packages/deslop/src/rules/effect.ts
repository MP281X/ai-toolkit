import {Array, String} from 'effect'

import ts from 'typescript'

import {
	callName,
	containsNode,
	isEffectCall,
	isLiteral,
	isMatchCall,
	isPipeCall,
	returnedExpression,
	typeLooksEffect
} from '#lib/ts.ts'
import type {Rule} from './helpers.ts'
import {
	functionLikeName,
	hasParameters,
	isComposedEffectArgument,
	isDataFirstEffectOperation,
	isEffectModuleReceiver,
	isEffectRunCall,
	isNamedFunctionLike,
	isNullishPredicateExpression,
	isRuntimeBoundary,
	isTailwindStringLiteral,
	nameNode,
	rule,
	standardPrototypeMethods
} from './helpers.ts'

export const effectRules = [
	rule('prefer-effect-fn-untraced', (node, context) => {
		if (!(isNamedFunctionLike(node) && hasParameters(node) && context.checker)) return
		const expression = returnedExpression(node)
		if (expression && typeLooksEffect(context.checker, expression)) {
			context.report(
				nameNode(node),
				'prefer-effect-fn-untraced',
				`"${functionLikeName(node)}" takes arguments and returns an Effect wrapper. Rewrite the function value with Effect.fnUntraced, yield each Effect with yield*, and return plain values from the generator.`
			)
		}
	}),
	rule('prefer-effect-gen-program', (node, context) => {
		if (!isNamedFunctionLike(node) || hasParameters(node) || !context.checker) return
		const expression = returnedExpression(node)
		if (expression && typeLooksEffect(context.checker, expression)) {
			context.report(
				nameNode(node),
				'prefer-effect-gen-program',
				`"${functionLikeName(node)}" has no arguments and only returns an Effect. Replace the function with one Effect.gen program value and remove the wrapper call layer.`
			)
		}
	}),
	rule('no-floating-effect', (node, context) => {
		if (!ts.isExpressionStatement(node)) return
		if (!(context.checker && typeLooksEffect(context.checker, node.expression))) return
		if (isEffectRunCall(node.expression) || isComposedEffectArgument(node.expression)) return
		context.report(
			node.expression,
			'no-floating-effect',
			'This Effect is created and then ignored. Yield it inside an Effect generator, compose it into another Effect, assign it for later composition, or run it only at a configured boundary.'
		)
	}),
	rule('prefer-top-level-pipe-for-effect-values', (node, context) => {
		if (!(ts.isCallExpression(node) && context.checker)) return
		if (ts.isCallExpression(node.parent) && isPipeCall(node.parent) && node.parent.arguments[0] !== node) return
		if (
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'pipe' &&
			typeLooksEffect(context.checker, node.expression.expression)
		) {
			context.report(
				node.expression.name,
				'prefer-top-level-pipe-for-effect-values',
				'This Effect is composed with .pipe. Rewrite the composition as pipe(effect, ...) so Effect pipelines use the project shape.'
			)
		}
		if (isDataFirstEffectOperation(node) && node.arguments[0] && typeLooksEffect(context.checker, node.arguments[0])) {
			context.report(
				node.expression,
				'prefer-top-level-pipe-for-effect-values',
				'This Effect is passed to a data-first Effect operation. Rewrite it as pipe(effect, Effect.operation) and keep the same operation arguments.'
			)
		}
	}),
	rule('prefer-effect-module-over-standard-library', (node, context) => {
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const module = standardPrototypeMethods.get(node.expression.name.text)
			if (module && !isEffectModuleReceiver(node.expression.expression)) {
				context.report(
					node.expression.name,
					'prefer-effect-module-over-standard-library',
					`This calls ${module}.prototype.${node.expression.name.text}. Use the matching Effect module function directly, or compose multiple module functions inside pipe(...).`
				)
			}
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression)
		) {
			if (node.expression.expression.text === 'Object') {
				context.report(
					node.expression.name,
					'prefer-effect-module-over-standard-library',
					`This calls ${node.expression.expression.text}.${node.expression.name.text}. Use the Effect module equivalent and keep the data flow explicit.`
				)
			}
		}
	}),
	rule('no-option-constructor', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			isOptionConstructor(node.expression)
		) {
			context.report(
				node.expression.name,
				'no-option-constructor',
				'This creates a new Option value. Do not call Option.some, Option.none, or Option.from*; use guards, optional chaining, or nullish coalescing at the boundary.'
			)
		}
	}),
	rule('no-dynamic-imports', (node, context) => {
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			context.report(
				node.expression,
				'no-dynamic-imports',
				'This uses dynamic import. Replace it with a static top-level import.'
			)
		}
	}),
	rule('no-tailwind-class-variables', (node, context) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cva') {
			context.report(
				node.expression,
				'no-tailwind-class-variables',
				'This hides Tailwind classes behind cva. Move the class strings directly into className or cn(...).'
			)
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			isTailwindStringLiteral(node.initializer)
		) {
			context.report(
				node.name,
				'no-tailwind-class-variables',
				'This variable only stores Tailwind classes. Move the class string directly into className or cn(...) and delete the variable.'
			)
		}
	}),
	rule('prefer-direct-call-for-single-data-operation', (node, context) => {
		if (!isPipeCall(node) || node.arguments.length !== 2 || !context.checker) return
		if (!node.arguments[0] || typeLooksEffect(context.checker, node.arguments[0])) return
		if (isMatchCall(node.arguments[0])) return
		context.report(
			node.expression,
			'prefer-direct-call-for-single-data-operation',
			'This pipe has one non-Effect data operation. Replace the pipe with the direct module call and keep pipe for multi-step or Effect composition.'
		)
	}),
	rule('prefer-effect-nullish-predicates', (node, context) => {
		if (!(ts.isArrowFunction(node) && ts.isCallExpression(node.parent))) return
		const expression = returnedExpression(node)
		if (expression && isNullishPredicateExpression(expression)) {
			context.report(
				node,
				'prefer-effect-nullish-predicates',
				'This callback only checks nullishness. Replace the callback with the matching Effect Predicate helper.'
			)
		}
	}),
	rule('no-effect-async-constructor-mismatch', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression)
		) {
			if (
				node.expression.expression.text === 'Effect' &&
				node.expression.name.text === 'sync' &&
				containsNode(node, ts.isAwaitExpression)
			) {
				context.report(
					node.expression.name,
					'no-effect-async-constructor-mismatch',
					'Effect.sync contains async work. Replace the constructor with Effect.promise or Effect.tryPromise.'
				)
			}
		}
	}),
	rule('no-effect-without-semantics', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			isEffectCall(node) &&
			Array.contains(['succeed', 'sync'] as const, callName(node)) &&
			node.arguments[0] &&
			isLiteral(node.arguments[0])
		) {
			context.report(
				node.expression,
				'no-effect-without-semantics',
				'This Effect only wraps a literal. Use the literal directly unless an actual Effect boundary is required.'
			)
		}
	}),
	rule('no-effect-run-away-from-boundary', (node, context) => {
		if (ts.isCallExpression(node) && isEffectRunCall(node) && !isRuntimeBoundary(context.filePath)) {
			context.report(
				node.expression,
				'no-effect-run-away-from-boundary',
				'This runs an Effect outside a runtime boundary. Return or compose the Effect here, and run it only from an allowed boundary file.'
			)
		}
	})
] as const satisfies readonly Rule[]

function isOptionConstructor(node: ts.PropertyAccessExpression) {
	return (
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'Option' &&
		(node.name.text === 'some' || node.name.text === 'none' || String.startsWith('from')(node.name.text))
	)
}
