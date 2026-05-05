import {Array, pipe, String} from 'effect'

import ts from 'typescript'

import {
	assignmentOperators,
	comparisonOperators,
	getSingleReturnedExpression,
	hasDefaultParameter,
	isAccessExpression,
	isBranchGrowingHelper,
	isCallShapeAdapter,
	isCssStringLiteral,
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
			if (
				isAnalyzableFunctionLike(node) &&
				Array.isReadonlyArrayNonEmpty(node.parameters) &&
				!hasDeclarationName(node)
			) {
				analyzeFunctionParameters(node, report)
			}

			if (
				isAnalyzableFunctionLike(node) &&
				node.type &&
				!(ts.isFunctionDeclaration(node) && node.name) &&
				!(ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) &&
				!(ts.isFunctionDeclaration(node) && node.name && RegExp('^(is|has)').test(node.name.text)) &&
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
				analyzeFunctionLike(node, node.name, references, report, _checker)
			}

			if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
				if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
					analyzeFunctionLike(node, node.parent.name, references, report, _checker)
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
		Array.forEach(parameter =>
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

	if (!(ts.isIdentifier(node.name) && node.initializer)) return

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

	if (!isTopLevelVariableDeclaration(node) && isSmallLiteralContainer(node.initializer)) {
		report(
			node.name,
			'no-small-literal-variable',
			'Do not store small object or array literals in local variables. Inline the literal where it is consumed.'
		)
	}

	if (
		!(
			isSpecificVariableIndirection(node.initializer) ||
			isTopLevelVariableDeclaration(node) ||
			isHookCallVariable(node) ||
			isReferencedFromNestedFunction(node)
		) &&
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

	if (
		ts.isNonNullExpression(node.initializer) &&
		(ts.isIdentifier(node.initializer.expression) || isAccessExpression(node.initializer.expression))
	) {
		report(
			node.name,
			'no-access-variable',
			'Do not copy a value into a non-null alias. Keep using the original expression so the assertion stays visible at the use site.'
		)
	}

	if (ts.isCallExpression(node.initializer) && isEffectGenCall(node.initializer)) {
		report(
			node.name,
			'no-effect-antipatterns',
			'Do not assign `Effect.gen(...)` directly. Rewrite it as `Effect.fnUntraced(function* (...) { ... })` so the effect boundary is explicit.'
		)
	}

	if (isTopLevelSingleUseInlineableExpression(node, references)) {
		report(
			node.name,
			'no-single-use-top-level-variable',
			'This top-level variable hides a small expression used once. Inline it at the usage site so module scope only holds shared values.'
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
		!(
			isTailwindStringLiteral(node.initializer) ||
			isCssStringLiteral(node.initializer) ||
			isSimpleCondition(node.initializer)
		) &&
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
	return !!ts.findAncestor(node, ancestor => ts.isVariableStatement(ancestor) && ts.isSourceFile(ancestor.parent))
}

function isSmallLiteralContainer(node: ts.Expression) {
	return (
		(ts.isObjectLiteralExpression(node) && Array.length(node.properties) <= 5) ||
		(ts.isArrayLiteralExpression(node) && Array.length(node.elements) <= 5)
	)
}

function isTopLevelSingleUseInlineableExpression(node: ts.VariableDeclaration, references: Map<string, number>) {
	return (
		isTopLevelVariableDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		!!node.initializer &&
		(references.get(node.name.text) === 1 ||
			(isExportedVariableDeclaration(node) && isSmallCollectionConstructor(node.initializer))) &&
		isInlineableTopLevelExpression(node.initializer)
	)
}

function isExportedVariableDeclaration(node: ts.VariableDeclaration) {
	return !!ts.findAncestor(
		node,
		ancestor =>
			ts.isVariableStatement(ancestor) &&
			Array.some(ts.getModifiers(ancestor) ?? [], modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
	)
}

function isInlineableTopLevelExpression(node: ts.Expression) {
	return (
		(ts.isArrayLiteralExpression(node) && Array.length(node.elements) <= 5) ||
		(ts.isObjectLiteralExpression(node) && Array.length(node.properties) <= 5) ||
		isSmallCollectionConstructor(node) ||
		(ts.isCallExpression(node) &&
			String.length(String.replaceAll(RegExp('\\s+', 'g'), ' ')(node.getText(node.getSourceFile()))) <= 120)
	)
}

function isSmallCollectionConstructor(node: ts.Expression) {
	return (
		ts.isNewExpression(node) &&
		ts.isIdentifier(node.expression) &&
		(node.expression.text === 'Set' || node.expression.text === 'Map') &&
		!!node.arguments?.[0] &&
		ts.isArrayLiteralExpression(node.arguments[0]) &&
		Array.length(node.arguments[0].elements) <= 5
	)
}

function isHookCallVariable(node: ts.VariableDeclaration) {
	return (
		!!node.initializer &&
		ts.isCallExpression(node.initializer) &&
		isHookCall(node.initializer) &&
		isInsideHookScope(node)
	)
}

function isHookCall(node: ts.CallExpression) {
	return (
		(ts.isIdentifier(node.expression) && String.startsWith('use')(node.expression.text)) ||
		(ts.isPropertyAccessExpression(node.expression) && String.startsWith('use')(node.expression.name.text))
	)
}

function isInsideHookScope(node: ts.Node) {
	return !!ts.findAncestor(node, ancestor => isComponentOrHookFunction(ancestor))
}

function isComponentOrHookFunction(node: ts.Node) {
	return (
		(ts.isFunctionDeclaration(node) && !!node.name && isComponentOrHookName(node.name.text)) ||
		((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
			ts.isVariableDeclaration(node.parent) &&
			ts.isIdentifier(node.parent.name) &&
			isComponentOrHookName(node.parent.name.text))
	)
}

function isComponentOrHookName(name: string) {
	return String.startsWith('use')(name) || RegExp('^[A-Z]').test(name)
}

function analyzeFunctionLike(
	node: ts.FunctionLikeDeclaration,
	name: ts.Identifier,
	references: Map<string, number>,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
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

	if (returnsEffectFromPlainFunction(node, checker)) {
		report(
			name,
			'no-effect-returning-function',
			'Do not return Effect values from a plain named function. Use Effect.fnUntraced so the Effect boundary is explicit.'
		)
	}

	if (
		node.type &&
		!RegExp('^(is|has)').test(name.text) &&
		!isRecursiveFunctionLike(node, name.text) &&
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

	if (!expression) return

	if (isAccessExpression(expression)) {
		return report(
			name,
			'no-access-helper',
			'This helper only hides property access. Inline the access at the call site.'
		)
	}

	if (ts.isCallExpression(expression) && isEffectGenCall(expression)) {
		report(
			name,
			'no-effect-antipatterns',
			'Do not wrap `Effect.gen(...)` in a function. Rewrite argument-taking effects as `Effect.fnUntraced(function* (value) { ... })`.'
		)
	}

	if ((isNamedArrowOrFunctionExpression(node) || ts.isFunctionDeclaration(node)) && ts.isCallExpression(expression)) {
		if (!isEffectGenCall(expression)) {
			if (!isExportedPolicyWrapper(node, expression) && isPassThroughCall(node, expression)) {
				report(
					name,
					'no-pass-through-function',
					'This function only passes parameters through. Inline the direct call at the call site.'
				)
			}

			if (!isExportedPolicyWrapper(node, expression) && isCallShapeAdapter(expression)) {
				report(
					name,
					'no-call-shape-adapter',
					'This wrapper only reshapes arguments for another call. Call the target directly with the final shape.'
				)
			}

			if (!isExportedPolicyWrapper(node, expression) && isLowValueSignatureWrapper(node, expression)) {
				report(
					name,
					'no-signature-wrapper',
					'This wrapper only forwards into another call. Call the target directly with the final shape.'
				)
			}
		}

		return
	}

	if (isNamedArrowOrFunctionExpression(node) && !ts.isCallExpression(expression)) {
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

function isRecursiveFunctionLike(node: ts.FunctionLikeDeclaration, name: string) {
	return node.body ? containsIdentifierReference(node.body, name) : false
}

function returnsEffectFromPlainFunction(node: ts.FunctionLikeDeclaration, checker?: ts.TypeChecker) {
	return (
		(ts.isFunctionDeclaration(node) || isNamedArrowOrFunctionExpression(node)) &&
		!isEffectFnUntracedCallback(node) &&
		Array.some(returnExpressions(node), expression => isEffectExpression(expression, checker))
	)
}

function isEffectFnUntracedCallback(node: ts.FunctionLikeDeclaration) {
	return (
		ts.isCallExpression(node.parent) &&
		node.parent.arguments.some(argument => argument === node) &&
		ts.isPropertyAccessExpression(node.parent.expression) &&
		node.parent.expression.name.text === 'fnUntraced' &&
		ts.isIdentifier(node.parent.expression.expression) &&
		node.parent.expression.expression.text === 'Effect'
	)
}

function returnExpressions(node: ts.FunctionLikeDeclaration) {
	if (node.body && ts.isExpression(node.body)) return [node.body]

	if (!(node.body && ts.isBlock(node.body))) return []

	return pipe(
		node.body.statements,
		Array.filter(ts.isReturnStatement),
		Array.flatMap(statement => (statement.expression ? [statement.expression] : []))
	)
}

function isEffectExpression(node: ts.Expression, checker?: ts.TypeChecker) {
	return (
		isDirectEffectCall(node) ||
		(checker ? String.startsWith('Effect<')(checker.typeToString(checker.getTypeAtLocation(node))) : false)
	)
}

function isDirectEffectCall(node: ts.Expression) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect'
	)
}

function hasDeclarationName(node: ts.FunctionLikeDeclaration) {
	return (ts.isFunctionDeclaration(node) && !!node.name) || isNamedArrowOrFunctionExpression(node)
}

function isReferencedFromNestedFunction(node: ts.VariableDeclaration) {
	if (!ts.isIdentifier(node.name)) return false

	return !!ts.findAncestor(node, ts.isFunctionLike) && containsNestedFunctionReference(node, node.name.text)
}

function containsNestedFunctionReference(declaration: ts.VariableDeclaration, name: string) {
	return !!ts.forEachChild(ts.findAncestor(declaration, ts.isFunctionLike)!, child => {
		if (child !== declaration.parent && ts.isFunctionLike(child) && containsIdentifierReference(child, name)) {
			return true
		}

		return containsNestedFunctionReferenceChild(child, name)
	})
}

function containsNestedFunctionReferenceChild(node: ts.Node, name: string): boolean {
	if (ts.isFunctionLike(node) && containsIdentifierReference(node, name)) return true

	return !!ts.forEachChild(node, child => (containsNestedFunctionReferenceChild(child, name) ? true : undefined))
}

function containsIdentifierReference(node: ts.Node, name: string): boolean {
	return (
		(ts.isIdentifier(node) && node.text === name && !ts.isVariableDeclaration(node.parent)) ||
		!!ts.forEachChild(node, child => (containsIdentifierReference(child, name) ? true : undefined))
	)
}

function isLowValueSignatureWrapper(node: ts.FunctionLikeDeclaration, expression: ts.CallExpression) {
	return (
		!isPipeCall(expression) &&
		Array.isReadonlyArrayNonEmpty(expression.arguments) &&
		Array.every(
			expression.arguments,
			argument => !containsFunctionOrObjectLiteral(argument) && containsParameterReference(argument, node)
		)
	)
}

function isExportedPolicyWrapper(node: ts.FunctionLikeDeclaration, expression: ts.CallExpression) {
	return (
		isExportedFunctionLike(node) && (containsPolicyLiteral(expression) || isVariadicCallComposition(node, expression))
	)
}

function isExportedFunctionLike(node: ts.FunctionLikeDeclaration) {
	if (ts.isFunctionDeclaration(node)) {
		return Array.some(ts.getModifiers(node) ?? [], modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
	}

	return (
		(ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
		ts.isVariableDeclaration(node.parent) &&
		isExportedVariableDeclaration(node.parent)
	)
}

function containsPolicyLiteral(node: ts.Node): boolean {
	return (
		ts.isObjectLiteralExpression(node) ||
		ts.isArrayLiteralExpression(node) ||
		!!ts.forEachChild(node, child => (containsPolicyLiteral(child) ? true : undefined))
	)
}

function isVariadicCallComposition(node: ts.FunctionLikeDeclaration, expression: ts.CallExpression) {
	return Array.some(node.parameters, parameter => !!parameter.dotDotDotToken) && containsNestedCall(expression)
}

function containsNestedCall(node: ts.Node): boolean {
	return ts.isCallExpression(node) && !!ts.forEachChild(node, child => (ts.isCallExpression(child) ? true : undefined))
}

function isPipeCall(expression: ts.CallExpression) {
	return ts.isIdentifier(expression.expression) && expression.expression.text === 'pipe'
}

function containsFunctionOrObjectLiteral(node: ts.Node): boolean {
	return (
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node) ||
		ts.isObjectLiteralExpression(node) ||
		!!ts.forEachChild(node, child => (containsFunctionOrObjectLiteral(child) ? true : undefined))
	)
}

function containsParameterReference(node: ts.Node, parent: ts.FunctionLikeDeclaration): boolean {
	return (
		(ts.isIdentifier(node) &&
			Array.some(
				parent.parameters,
				parameter => ts.isIdentifier(parameter.name) && parameter.name.text === node.text
			)) ||
		!!ts.forEachChild(node, child => (containsParameterReference(child, parent) ? true : undefined))
	)
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
