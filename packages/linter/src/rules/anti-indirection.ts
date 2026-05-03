import {Array, pipe} from 'effect'

import ts from 'typescript'

import {
	assignmentOperators,
	comparisonOperators,
	getSingleReturnedExpression,
	hasDefaultParameter,
	isAccessExpression,
	isBranchGrowingHelper,
	isCallShapeAdapter,
	isEffectGenCall,
	isNamedArrowOrFunctionExpression,
	isPassThroughCall,
	isPrimitiveLiteral,
	isTailwindStringLiteral
} from '#lib/utils.ts'

export const antiIndirectionRules = [
	{
		name: 'variable-declaration-rules',
		apply(
			node: ts.Node,
			references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			_checker?: ts.TypeChecker
		) {
			if (ts.isVariableDeclaration(node)) {
				analyzeVariableDeclaration(node, references, report)
			}
		}
	},
	{
		name: 'function-rules',
		apply(
			node: ts.Node,
			references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			_checker?: ts.TypeChecker
		) {
			if (isAnalyzableFunctionLike(node) && Array.isReadonlyArrayNonEmpty(node.parameters)) {
				analyzeFunctionParameters(node, report)
			}

			if (
				isAnalyzableFunctionLike(node) &&
				node.type &&
				!(ts.isFunctionDeclaration(node) && node.name) &&
				!(ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) &&
				!(ts.isFunctionDeclaration(node) && node.name && /^(is|has)/.test(node.name.text)) &&
				!ts.isTypePredicateNode(node.type) &&
				node.type.kind !== ts.SyntaxKind.TypePredicate &&
				node.type.kind !== ts.SyntaxKind.BooleanKeyword
			) {
				report(
					node.type,
					'no-return-type-annotation',
					'Remove this return type annotation. Let the implementation define the return type.'
				)
			}

			if (ts.isFunctionDeclaration(node) && node.name) {
				analyzeFunctionLike(node, node.name, references, report)
			}

			if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
				if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
					analyzeFunctionLike(node, node.parent.name, references, report)
				}
			}
		}
	}
]

function isAnalyzableFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

function analyzeFunctionParameters(
	node: ts.FunctionLikeDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	pipe(
		node.parameters,
		Array.filter(parameter => ts.isObjectBindingPattern(parameter.name) || ts.isArrayBindingPattern(parameter.name)),
		Array.map(parameter =>
			report(
				parameter.name,
				'no-arg-destructuring',
				"Don't destructure function parameters. Keep the original parameter object and access `param.prop` inside the body so the data source stays visible."
			)
		)
	)
}

function analyzeVariableDeclaration(
	node: ts.VariableDeclaration,
	references: Map<string, number>,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		node.type &&
		!ts.isTypePredicateNode(node.type) &&
		node.type.kind !== ts.SyntaxKind.TypePredicate &&
		node.type.kind !== ts.SyntaxKind.BooleanKeyword
	) {
		report(
			node.type,
			'no-variable-type-annotation',
			'Remove this variable type annotation. Rely on inference so the implementation stays direct.'
		)
	}

	if (!(ts.isIdentifier(node.name) && node.initializer)) {
		return
	}

	if (isPrimitiveLiteral(node.initializer) && !isTailwindStringLiteral(node.initializer)) {
		report(
			node.name,
			'no-primitive-const',
			'Do not extract primitive literals into standalone constants. Inline the value at the use site so the code stays direct.'
		)
	}

	if (isTailwindStringLiteral(node.initializer)) {
		report(
			node.name,
			'no-tailwind-class-variables',
			'Do not store Tailwind class tokens outside `className` or `className={cn(...)}`. Inline the classes at the JSX use site.'
		)
	}

	if (
		!(isSpecificVariableIndirection(node.initializer) || isTopLevelVariableDeclaration(node)) &&
		references.get(node.name.text) === 1
	) {
		report(
			node.name,
			'no-single-use-variable',
			'This variable is used once. Inline the value at the usage site so data flow stays linear.'
		)
	}

	if (isAccessExpression(node.initializer)) {
		report(
			node.name,
			'no-access-variable',
			'This variable only renames property access. Inline the access where the value is consumed.'
		)
	}

	if (ts.isIdentifier(node.initializer)) {
		report(
			node.name,
			'no-access-variable',
			'Do not copy a value into a same-level alias. Keep using the original name so the code stays direct.'
		)
	}

	if (ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.some(ts.isSpreadAssignment)) {
		report(
			node.name,
			'no-access-variable',
			'Do not clone a value into a same-level alias with object spread. Keep using the original name so the code stays direct.'
		)
	}

	if (isSimpleCondition(node.initializer)) {
		report(
			node.name,
			'no-simple-condition-variable',
			'This variable only hides a simple condition. Inline the condition where control flow uses it.'
		)
	}

	if (
		!(isTailwindStringLiteral(node.initializer) || isSimpleCondition(node.initializer)) &&
		isDerivedSimpleExpression(node.initializer)
	) {
		report(
			node.name,
			'no-derived-simple-variable',
			'This variable only hides a simple derived value. Inline the expression at the consuming boundary.'
		)
	}
}

function isSpecificVariableIndirection(node: ts.Expression) {
	return (
		isAccessExpression(node) ||
		ts.isIdentifier(node) ||
		(ts.isObjectLiteralExpression(node) && node.properties.some(ts.isSpreadAssignment)) ||
		isSimpleCondition(node) ||
		isDerivedSimpleExpression(node) ||
		isTailwindStringLiteral(node)
	)
}

function isTopLevelVariableDeclaration(node: ts.VariableDeclaration) {
	return (
		ts.isVariableDeclarationList(node.parent) &&
		ts.isVariableStatement(node.parent.parent) &&
		ts.isSourceFile(node.parent.parent.parent)
	)
}

function analyzeFunctionLike(
	node: ts.FunctionLikeDeclaration,
	name: ts.Identifier,
	references: Map<string, number>,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		node.parameters.some(
			parameter => ts.isObjectBindingPattern(parameter.name) || ts.isArrayBindingPattern(parameter.name)
		)
	) {
		report(
			name,
			'no-arg-destructuring',
			"Don't destructure function parameters. Keep the original parameter object and access `param.prop` inside the body so the data source stays visible."
		)
	}

	if (!ts.isFunctionDeclaration(node) && isBranchGrowingHelper(node) && name.text.startsWith('get')) {
		report(
			name,
			'no-helper-branch-growth',
			'This helper grows branches over data shapes. Move the branch to the concrete call site so behavior stays local.'
		)
		report(
			name,
			'no-union-normalizer-helper',
			'This helper normalizes union members. Use the concrete field at each concrete boundary instead of hiding shape differences.'
		)
	}

	if (hasDefaultParameter(node)) {
		report(
			name,
			'no-configurable-helper',
			'This helper has local configuration. Inline the policy at the consuming boundary instead of preserving a configurable helper.'
		)
	}

	if (isNamedArrowOrFunctionExpression(node)) {
		report(
			name,
			'no-arrow-for-named',
			'Rewrite this as `function name(...) { ... }`. Named functions must use function declarations; arrows are only allowed for callbacks.'
		)
	}

	if (
		node.type &&
		!/^(is|has)/.test(name.text) &&
		!ts.isTypePredicateNode(node.type) &&
		node.type.kind !== ts.SyntaxKind.TypePredicate &&
		node.type.kind !== ts.SyntaxKind.BooleanKeyword
	) {
		report(
			node.type,
			'no-return-type-annotation',
			'Remove this return type annotation. Let the implementation define the return type.'
		)
	}

	if (isNamedArrowOrFunctionExpression(node) && references.get(name.text) === 1) {
		report(
			name,
			'no-single-expression-function',
			'This function is used once. Inline it at the call site so the implementation stays linear.'
		)
	}

	const expression = getSingleReturnedExpression(node)

	if (!expression) {
		return
	}

	if (isAccessExpression(expression)) {
		report(name, 'no-access-helper', 'This helper only hides property access. Inline the access at the call site.')
		return
	}

	if (isNamedArrowOrFunctionExpression(node) && ts.isCallExpression(expression)) {
		if (isEffectGenCall(expression)) {
			report(
				name,
				'no-effect-antipatterns',
				'Do not wrap `Effect.gen(...)` in a function. Rewrite argument-taking effects as `Effect.fnUntraced(function* (value) { ... })`.'
			)
		}

		if (isPassThroughCall(node, expression)) {
			report(
				name,
				'no-pass-through-function',
				'This function only passes parameters through. Inline the direct call at the call site.'
			)
		}

		if (isCallShapeAdapter(expression)) {
			report(
				name,
				'no-call-shape-adapter',
				'This wrapper only reshapes arguments for another call. Call the target directly with the final shape.'
			)
		}

		report(
			name,
			'no-signature-wrapper',
			'This wrapper only forwards into another call. Call the target directly with the final shape.'
		)
		return
	}

	if (ts.isCallExpression(expression)) {
		return
	}

	if (isNamedArrowOrFunctionExpression(node)) {
		report(
			name,
			'no-one-line-function',
			'This function only hides one expression. Inline the expression where it is consumed.'
		)
		report(
			name,
			'no-simple-function-variables',
			'Inline the expression at each call site. Trivial local helpers add indirection and weaken inference.'
		)
	}
}

export function isSimpleCondition(node: ts.Expression) {
	return (
		(ts.isBinaryExpression(node) && comparisonOperators.has(node.operatorToken.kind)) ||
		(ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) ||
		(ts.isBinaryExpression(node) &&
			[ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind))
	)
}

export function isDerivedSimpleExpression(node: ts.Expression) {
	return (
		ts.isTemplateExpression(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		(ts.isBinaryExpression(node) &&
			!comparisonOperators.has(node.operatorToken.kind) &&
			!assignmentOperators.has(node.operatorToken.kind)) ||
		ts.isConditionalExpression(node)
	)
}
