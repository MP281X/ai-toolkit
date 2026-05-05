import {Array, Option, pipe, String} from 'effect'

import ts from 'typescript'

import {effectModuleNames, mutationPrototypeMethods, transformPrototypeMethods} from '#lib/utils.ts'

export const functionalEffectRules = [
	{
		name: 'call-expression-rules',
		apply(
			node: ts.Node,
			_references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			checker?: ts.TypeChecker
		) {
			if (ts.isCallExpression(node)) {
				analyzeCallExpression(node, report, checker)
			}

			if (ts.isConditionalExpression(node)) {
				analyzeConditionalExpression(node, report)
			}

			if (ts.isPropertyAccessExpression(node)) {
				analyzePropertyAccessExpression(node, report)
			}

			if (ts.isExpressionStatement(node)) {
				analyzeExpressionStatement(node, report, checker)
			}

			if (ts.isNewExpression(node)) {
				analyzeNewExpression(node, report)
			}
		}
	}
]

function analyzeCallExpression(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
) {
	if (ts.isPropertyAccessExpression(node.expression)) {
		if (
			checker &&
			['add', 'clear', 'delete', 'set'].includes(node.expression.name.text) &&
			isMapOrSetType(checker.getTypeAtLocation(node.expression.expression)) &&
			!isLocalCollectionAccumulatorMutation(node, checker)
		) {
			report(
				node.expression.name,
				'no-map-set-mutation',
				'Do not mutate Map or Set. Use Effect HashMap or HashSet so collection updates stay functional.'
			)
		}

		if (
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'JSON' &&
			['parse', 'stringify'].includes(node.expression.name.text) &&
			!isAllowedJsonStringifyDebugCall(node)
		) {
			report(
				node.expression.name,
				'no-json-api',
				'Do not use raw JSON parse/stringify. Use Schema codecs or typed Effect boundaries so data shape stays explicit.'
			)
		}

		if (
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'Promise' &&
			['all', 'allSettled', 'any', 'race', 'resolve', 'reject'].includes(node.expression.name.text)
		) {
			report(
				node.expression.name,
				'no-promise-api',
				'Do not use Promise APIs directly. Use Effect concurrency and typed error handling instead.'
			)
		}

		if (
			mutationPrototypeMethods.has(node.expression.name.text) &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text)) &&
			isNativePrototypeTarget(node.expression.expression, checker)
		) {
			return report(
				node.expression.name,
				'no-mutation',
				'This prototype call mutates existing state. Return a new value with an Effect module helper.'
			)
		}

		if (node.expression.name.text === 'pipe') {
			report(
				node.expression.name,
				'no-pipe-method',
				'Do not use the `.pipe()` method. Use the free `pipe(value, ...)` function instead.'
			)
		}

		if (
			transformPrototypeMethods.has(node.expression.name.text) &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text)) &&
			isNativePrototypeTarget(node.expression.expression, checker)
		) {
			report(
				node.expression.name,
				'no-native-prototype-method',
				'Use the Effect module helper instead of a native prototype method. Replace string, array, and record transforms with `String.*`, `Array.*`, or `Record.*` inside `pipe`.'
			)
		}

		if (node.expression.name.text === 'then') {
			report(node.expression.name, 'no-promise-api', 'Replace promise chaining with linear Effect composition.')
		}

		if (
			(node.expression.name.text === 'catch' || node.expression.name.text === 'finally') &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text))
		) {
			report(
				node.expression.name,
				'no-promise-api',
				'Replace promise chaining with Effect.catch* or ensuring/finalizer combinators.'
			)
		}
	}

	if (ts.isIdentifier(node.expression)) {
		if (node.expression.text === 'pipe') {
			if (isSingleStepEffectPipe(node)) {
				report(
					node.expression,
					'no-useless-pipe',
					'Do not use pipe for a single Effect module transform. Call the helper directly or use its curried form.'
				)
			}

			if (Array.some(node.arguments, containsYieldExpression)) {
				report(
					node.expression,
					'no-yield-in-pipe',
					'Do not yield inside pipe arguments. Keep the Effect value in the pipeline and compose with Effect.map or Effect.flatMap.'
				)
			}
		}

		if (Array.contains(['forwardRef', 'memo', 'useCallback', 'useMemo'], node.expression.text)) {
			report(
				node.expression,
				'no-react-compiler-antipatterns',
				`Do not use \`${node.expression.text}\` here. React Compiler already handles this optimization, so remove the wrapper unless an external API requires it.`
			)
		}

		if (
			node.expression.text === 'useState' &&
			node.arguments[0] &&
			(ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
		) {
			report(
				node.expression,
				'no-react-compiler-antipatterns',
				'Do not use lazy `useState` initializers here. React Compiler already handles memoization, so create the value directly.'
			)
		}

		if (node.expression.text === 'cva') {
			report(
				node.expression,
				'no-tailwind-class-variables',
				'Do not use `cva(...)` outside `components/ui`. Tailwind class tokens may only live directly in `className` or `className={cn(...)}`.'
			)
		}
	}

	if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
		report(
			node.expression,
			'no-dynamic-imports',
			'Remove this dynamic import. Keep module dependencies static and visible.'
		)
	}
}

function analyzeConditionalExpression(
	node: ts.ConditionalExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (isArrayEmptyCheck(node.condition)) {
		report(
			node.condition,
			'no-array-empty-ternary',
			'Do not branch on Array emptiness with a ternary. Use Array.match so the empty and non-empty branches are explicit.'
		)
	}
}

function isSingleStepEffectPipe(node: ts.CallExpression) {
	return (
		Array.length(node.arguments) === 2 &&
		!!node.arguments[1] &&
		(ts.isPropertyAccessExpression(node.arguments[1]) || isEffectModuleHelperCall(node.arguments[1]))
	)
}

function isEffectModuleHelperCall(node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		effectModuleNames.has(node.expression.expression.text)
	)
}

function containsYieldExpression(node: ts.Node): boolean {
	return (
		ts.isYieldExpression(node) || !!ts.forEachChild(node, child => (containsYieldExpression(child) ? true : undefined))
	)
}

function isArrayEmptyCheck(node: ts.Expression) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Array' &&
		(node.expression.name.text === 'isReadonlyArrayEmpty' || node.expression.name.text === 'isReadonlyArrayNonEmpty')
	)
}

function analyzePropertyAccessExpression(
	node: ts.PropertyAccessExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'Option' &&
		String.startsWith('from')(node.name.text)
	) {
		report(
			node.name,
			'no-option-from-conversion',
			'Do not wrap ordinary nullable values with Option.from*. Use direct guards, optional chaining, ??, or caller-proven invariants; keep Option for values already returned by Effect modules.'
		)
	}
}

function analyzeExpressionStatement(
	node: ts.ExpressionStatement,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
) {
	if (isFloatingEffectExpression(node.expression, checker)) {
		report(
			node.expression,
			'floatingEffect',
			'Effects are lazy and must not float. Assign the Effect, return it, yield it, or run it at the boundary.'
		)
	}

	if (ts.isCallExpression(node.expression) && isDiscardedArrayTransform(node.expression)) {
		report(
			node.expression,
			'no-discarded-array-transform',
			'Do not discard an Array transform result. Use Array.forEach for side effects or keep the transformed value in the data flow.'
		)
	}
}

function isFloatingEffectExpression(node: ts.Expression, checker?: ts.TypeChecker): boolean {
	if (checker && isEffectType(checker.getTypeAtLocation(node))) return true

	if (ts.isParenthesizedExpression(node)) return isFloatingEffectExpression(node.expression, checker)

	if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
		return isFloatingEffectExpression(node.expression, checker)
	}

	if (ts.isVoidExpression(node)) return isFloatingEffectExpression(node.expression, checker)

	return ts.isCallExpression(node) && isObviousEffectCreationCall(node)
}

function isEffectType(type: ts.Type): boolean {
	if (type.isUnion()) return Array.some(type.types, isEffectType)

	return type.getSymbol()?.escapedName === 'Effect' || type.aliasSymbol?.escapedName === 'Effect'
}

function isObviousEffectCreationCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect' &&
		!Array.contains(
			['fn', 'fnUntraced', 'runCallback', 'runFork', 'runPromise', 'runPromiseExit', 'runSync'],
			node.expression.name.text
		)
	)
}

function isDiscardedArrayTransform(node: ts.CallExpression): boolean {
	return isEffectArrayTransformCall(node) || isPipeWithDiscardedArrayTransform(node)
}

function isPipeWithDiscardedArrayTransform(node: ts.CallExpression) {
	return (
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'pipe' &&
		pipe(
			node.arguments,
			Array.last,
			Option.exists(argument => ts.isCallExpression(argument) && isEffectArrayTransformCall(argument))
		)
	)
}

function isEffectArrayTransformCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Array' &&
		Array.contains(['filter', 'flatMap', 'map', 'reduce', 'sort', 'toSorted'], node.expression.name.text)
	)
}

function analyzeNewExpression(node: ts.NewExpression, report: (node: ts.Node, rule: string, message: string) => void) {
	if (
		ts.isIdentifier(node.expression) &&
		(node.expression.text === 'Map' || node.expression.text === 'Set') &&
		!(isStaticLookupCollection(node) || isLocalCollectionAccumulator(node))
	) {
		report(
			node.expression,
			'no-map-set-mutation',
			'Do not create mutable Map or Set collections. Use Effect HashMap or HashSet instead.'
		)
	}
}

function isStaticLookupCollection(node: ts.NewExpression) {
	return (
		ts.isVariableDeclaration(node.parent) &&
		node.parent.initializer === node &&
		isTopLevelConstVariableDeclaration(node.parent) &&
		Array.length(node.arguments ?? []) === 1 &&
		pipe(node.arguments ?? [], Array.head, Option.exists(ts.isArrayLiteralExpression))
	)
}

function isLocalCollectionAccumulatorMutation(node: ts.CallExpression, checker: ts.TypeChecker) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		Array.some(
			checker.getSymbolAtLocation(node.expression.expression)?.declarations ?? [],
			isLocalCollectionAccumulatorDeclaration
		)
	)
}

function isLocalCollectionAccumulator(node: ts.NewExpression) {
	return (
		ts.isVariableDeclaration(node.parent) &&
		node.parent.initializer === node &&
		isConstVariableDeclaration(node.parent) &&
		!!ts.findAncestor(node, ts.isFunctionLike)
	)
}

function isTopLevelConstVariableDeclaration(node: ts.VariableDeclaration) {
	return (
		isConstVariableDeclaration(node) &&
		!!ts.findAncestor(node, ancestor => ts.isVariableStatement(ancestor) && ts.isSourceFile(ancestor.parent))
	)
}

function isConstVariableDeclaration(node: ts.VariableDeclaration) {
	return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0
}

function isLocalCollectionAccumulatorDeclaration(node: ts.Declaration) {
	return (
		ts.isVariableDeclaration(node) &&
		!!node.initializer &&
		ts.isNewExpression(node.initializer) &&
		ts.isIdentifier(node.initializer.expression) &&
		(node.initializer.expression.text === 'Map' || node.initializer.expression.text === 'Set') &&
		ts.isVariableDeclarationList(node.parent) &&
		(node.parent.flags & ts.NodeFlags.Const) !== 0 &&
		!!ts.findAncestor(node, ts.isFunctionLike)
	)
}

function isAllowedJsonStringifyDebugCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'stringify' &&
		Array.length(node.arguments) === 3 &&
		node.arguments[1]?.kind === ts.SyntaxKind.NullKeyword &&
		!!node.arguments[2] &&
		ts.isNumericLiteral(node.arguments[2]) &&
		node.arguments[2].text === '2'
	)
}

function isNativePrototypeTarget(node: ts.Expression, checker?: ts.TypeChecker) {
	if (!checker) return true

	return isStringLike(checker.getTypeAtLocation(node)) || checker.isArrayType(checker.getTypeAtLocation(node))
}

function isMapOrSetType(type: ts.Type): boolean {
	if (type.isUnion()) return type.types.some(isMapOrSetType)

	const symbol = type.getSymbol()

	return (
		symbol?.escapedName === 'Map' ||
		symbol?.escapedName === 'Set' ||
		(!!type.aliasSymbol && (type.aliasSymbol.escapedName === 'Map' || type.aliasSymbol.escapedName === 'Set'))
	)
}

function isStringLike(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.StringLike))
}
