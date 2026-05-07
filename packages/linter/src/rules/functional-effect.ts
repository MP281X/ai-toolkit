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
				'Replace Map/Set mutation with Effect HashMap or HashSet update.'
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
				'Replace JSON parse/stringify with Schema codec or typed Effect boundary.'
			)
		}

		if (
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'Promise' &&
			['all', 'allSettled', 'any', 'race', 'resolve', 'reject'].includes(node.expression.name.text)
		) {
			report(node.expression.name, 'no-promise-api', 'Replace Promise API with Effect concurrency.')
		}

		if (
			mutationPrototypeMethods.has(node.expression.name.text) &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text)) &&
			isNativePrototypeTarget(node.expression.expression, checker)
		) {
			return report(
				node.expression.name,
				'no-mutation',
				'Replace mutating prototype call with Effect Array/String helper.'
			)
		}

		if (node.expression.name.text === 'pipe') {
			report(node.expression.name, 'no-method-pipe', 'Use pipe(value, ...) instead of value.pipe(...).')
		}

		if (
			transformPrototypeMethods.has(node.expression.name.text) &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text)) &&
			isNativePrototypeTarget(node.expression.expression, checker)
		) {
			report(
				node.expression.name,
				'no-native-prototype-method',
				'Replace native prototype transform with Effect String/Array/Record helper.'
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
			if (isSingleStepArrayStringPipe(node)) {
				report(node.expression, 'no-useless-pipe', 'Use direct Array/String helper calls for one-step transforms.')
			}

			if (Array.some(node.arguments, argument => containsOwnedYieldExpression(argument, owningRuntimeFunction(node)))) {
				report(
					node.expression,
					'no-yield-in-pipe',
					'Current generator yield is inside a pipe argument. Move the yielded Effect before the pipe with Effect.map or Effect.flatMap.'
				)
			}
		}

		if (Array.contains(['forwardRef', 'memo', 'useCallback', 'useMemo'], node.expression.text)) {
			report(
				node.expression,
				'no-react-compiler-antipatterns',
				`Remove \`${node.expression.text}\` wrapper; React Compiler handles it.`
			)
		}

		if (
			node.expression.text === 'useState' &&
			node.arguments[0] &&
			(ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
		) {
			report(node.expression, 'no-react-compiler-antipatterns', 'Replace lazy useState initializer with direct value.')
		}

		if (node.expression.text === 'cva') {
			report(node.expression, 'no-tailwind-class-variables', 'Move cva classes into className or cn(...).')
		}
	}

	if (isNoopEffectGen(node)) {
		report(
			node.expression,
			'no-unnecessary-effect-gen',
			'Replace Effect.gen(function* () { return yield* value }) with the yielded Effect value directly.'
		)
	}

	if (isMatchLiteralBranchWithoutConstAssertion(node)) {
		report(
			node,
			'prefer-const-literal-branch',
			'Add `as const` to Match literal branches when the branch returns a string, number, or boolean literal.'
		)
	}

	if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
		report(node.expression, 'no-dynamic-imports', 'Replace dynamic import with static import.')
	}

	if (ts.isPropertyAccessExpression(node.expression) && isOptionFromConversion(node.expression)) {
		report(
			node.expression.name,
			'no-option-from-conversion',
			'Replace Option.from* conversion with guard, optional chaining, or ??.'
		)
	}
}

function isSingleStepArrayStringPipe(node: ts.CallExpression) {
	return (
		Array.length(node.arguments) === 2 &&
		!!node.arguments[1] &&
		(ts.isPropertyAccessExpression(node.arguments[1]) || isArrayStringHelperCall(node.arguments[1])) &&
		isArrayStringHelper(
			ts.isPropertyAccessExpression(node.arguments[1]) ? node.arguments[1] : node.arguments[1].expression
		)
	)
}

function isArrayStringHelperCall(node: ts.Node): node is ts.CallExpression & {expression: ts.PropertyAccessExpression} {
	return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
}

function isArrayStringHelper(node: ts.Node) {
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		Array.contains(['Array', 'String'], node.expression.text)
	)
}

function containsOwnedYieldExpression(node: ts.Node, owner: ts.FunctionLikeDeclaration | undefined): boolean {
	return (
		(ts.isYieldExpression(node) && ts.findAncestor(node, ts.isFunctionLike) === owner) ||
		!!ts.forEachChild(node, child => (containsOwnedYieldExpression(child, owner) ? true : undefined))
	)
}

function owningRuntimeFunction(node: ts.Node) {
	return ts.findAncestor(
		node,
		ancestor =>
			ts.isFunctionDeclaration(ancestor) ||
			ts.isMethodDeclaration(ancestor) ||
			ts.isConstructorDeclaration(ancestor) ||
			ts.isGetAccessorDeclaration(ancestor) ||
			ts.isSetAccessorDeclaration(ancestor) ||
			ts.isFunctionExpression(ancestor) ||
			ts.isArrowFunction(ancestor)
	)
}

function isNoopEffectGen(node: ts.CallExpression) {
	const statements = effectGenBodyStatements(node)

	if (!statements) return false

	return isReturnYieldStatement(statements) || isYieldAliasReturn(statements)
}

function effectGenBodyStatements(node: ts.CallExpression) {
	if (
		!(ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) ||
		node.expression.expression.text !== 'Effect' ||
		node.expression.name.text !== 'gen' ||
		!node.arguments[0] ||
		!(ts.isFunctionExpression(node.arguments[0]) || ts.isArrowFunction(node.arguments[0])) ||
		!ts.isBlock(node.arguments[0].body)
	) {
		return
	}

	return node.arguments[0].body.statements
}

function isReturnYieldStatement(statements: readonly ts.Statement[]) {
	return (
		Array.length(statements) === 1 &&
		!!statements[0] &&
		ts.isReturnStatement(statements[0]) &&
		!!statements[0].expression &&
		ts.isYieldExpression(statements[0].expression) &&
		statements[0].expression.asteriskToken !== undefined
	)
}

function isYieldAliasReturn(statements: readonly ts.Statement[]) {
	return (
		Array.length(statements) === 2 &&
		!!statements[0] &&
		!!statements[1] &&
		ts.isVariableStatement(statements[0]) &&
		Array.length(statements[0].declarationList.declarations) === 1 &&
		!!statements[0].declarationList.declarations[0] &&
		ts.isIdentifier(statements[0].declarationList.declarations[0].name) &&
		!!statements[0].declarationList.declarations[0].initializer &&
		ts.isYieldExpression(statements[0].declarationList.declarations[0].initializer) &&
		statements[0].declarationList.declarations[0].initializer.asteriskToken !== undefined &&
		ts.isReturnStatement(statements[1]) &&
		!!statements[1].expression &&
		ts.isIdentifier(statements[1].expression) &&
		statements[1].expression.text === statements[0].declarationList.declarations[0].name.text
	)
}

function isMatchLiteralBranchWithoutConstAssertion(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Match' &&
		Array.contains(['when', 'orElse'], node.expression.name.text) &&
		Array.some(
			node.arguments,
			argument =>
				(ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && isConstAssertableLiteral(argument.body)
		)
	)
}

function isConstAssertableLiteral(node: ts.Node) {
	return (
		(ts.isStringLiteral(node) ||
			ts.isNumericLiteral(node) ||
			node.kind === ts.SyntaxKind.TrueKeyword ||
			node.kind === ts.SyntaxKind.FalseKeyword) &&
		!(
			ts.isAsExpression(node.parent) &&
			ts.isTypeReferenceNode(node.parent.type) &&
			ts.isIdentifier(node.parent.type.typeName) &&
			node.parent.type.typeName.text === 'const'
		)
	)
}

function analyzePropertyAccessExpression(
	node: ts.PropertyAccessExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (ts.isCallExpression(node.parent) && node.parent.expression === node) return

	if (isOptionFromConversion(node)) {
		report(
			node.name,
			'no-option-from-conversion',
			'Replace Option.from* conversion with guard, optional chaining, or ??.'
		)
	}
}

function isOptionFromConversion(node: ts.PropertyAccessExpression) {
	return (
		ts.isIdentifier(node.expression) && node.expression.text === 'Option' && String.startsWith('from')(node.name.text)
	)
}

function analyzeExpressionStatement(
	node: ts.ExpressionStatement,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
) {
	if (isFloatingEffectExpression(node.expression, checker)) {
		report(node.expression, 'floatingEffect', 'Return, yield, or run the Effect.')
	}

	if (ts.isCallExpression(node.expression) && isDiscardedArrayTransform(node.expression)) {
		report(
			node.expression,
			'no-discarded-array-transform',
			'Use Array.forEach or pass the transform result to its consumer.'
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
		report(node.expression, 'no-map-set-mutation', 'Replace mutable Map/Set with Effect HashMap or HashSet.')
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
