import ts from 'typescript'

import {
	effectModuleNames,
	mutationPrototypeMethods,
	reactCompilerFunctions,
	transformPrototypeMethods
} from '#lib/utils.ts'

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
			mutationPrototypeMethods.has(node.expression.name.text) &&
			!(ts.isIdentifier(node.expression.expression) && effectModuleNames.has(node.expression.expression.text)) &&
			isNativePrototypeTarget(node.expression.expression, checker)
		) {
			report(
				node.expression.name,
				'no-mutation',
				'This prototype call mutates existing state. Return a new value with an Effect module helper.'
			)
			return
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
			report(
				node.expression.name,
				'no-then',
				'Replace promise `.then` chaining with linear Effect or async control flow.'
			)
		}
	}

	if (ts.isIdentifier(node.expression)) {
		if (reactCompilerFunctions.has(node.expression.text)) {
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

function isNativePrototypeTarget(node: ts.Expression, checker?: ts.TypeChecker) {
	if (!checker) {
		return true
	}

	return isStringLike(checker.getTypeAtLocation(node)) || checker.isArrayType(checker.getTypeAtLocation(node))
}

function isStringLike(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.StringLike))
}
