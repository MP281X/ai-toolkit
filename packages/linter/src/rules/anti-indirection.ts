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
				report(node.type, 'no-return-type-annotation', 'Remove return type annotation.')
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
				'Replace parameter destructuring with named parameter plus property access.'
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
		!isRecursiveVariableFunction(node) &&
		!ts.isTypePredicateNode(node.type) &&
		node.type.kind !== ts.SyntaxKind.TypePredicate &&
		node.type.kind !== ts.SyntaxKind.BooleanKeyword
	) {
		report(
			node.type,
			'no-variable-type-annotation',
			'Remove variable type annotation unless TypeScript requires it for recursive functions.'
		)
	}

	if (!(ts.isIdentifier(node.name) && node.initializer)) return

	if (isPrimitiveLiteral(node.initializer) && !isTailwindStringLiteral(node.initializer)) {
		report(node.name, 'no-primitive-const', 'Inline primitive literal at each read site.')
	}

	if (isTailwindStringLiteral(node.initializer)) {
		report(node.name, 'no-tailwind-class-variables', 'Move Tailwind classes directly into className or cn(...).')
	}

	if (!isTopLevelVariableDeclaration(node) && isSmallLiteralContainer(node.initializer)) {
		report(node.name, 'no-small-literal-variable', 'Inline small object/array literal at each read site.')
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
		report(node.name, 'no-single-use-variable', 'Inline single-use variable at its read site.')
	}

	if (isAccessExpression(node.initializer)) {
		report(node.name, 'no-access-variable', 'Inline initializer expression at each read site.')
	}

	if (ts.isIdentifier(node.initializer)) {
		report(node.name, 'no-access-variable', 'Inline original identifier at each alias read site.')
	}

	if (
		ts.isNonNullExpression(node.initializer) &&
		(ts.isIdentifier(node.initializer.expression) || isAccessExpression(node.initializer.expression))
	) {
		report(node.name, 'no-access-variable', 'Move non-null assertion to each read site.')
	}

	if (isTopLevelSingleUseInlineableExpression(node, references)) {
		report(node.name, 'no-single-use-top-level-variable', 'Inline single-use top-level expression at its read site.')
	}

	if (ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.some(ts.isSpreadAssignment)) {
		report(node.name, 'no-access-variable', 'Inline object-spread alias at each read site.')
	}

	if (isSimpleCondition(node.initializer)) {
		report(node.name, 'no-simple-condition-variable', 'Inline simple condition where control flow uses it.')
	}

	if (
		!(
			isTailwindStringLiteral(node.initializer) ||
			isCssStringLiteral(node.initializer) ||
			isSimpleCondition(node.initializer) ||
			isIdentityBearingExpression(node.initializer)
		) &&
		isDerivedSimpleExpression(node.initializer)
	) {
		report(
			node.name,
			'no-derived-simple-variable',
			'Inline pure derived expression at each read site. Keep identity-bearing values like random IDs bound once.'
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
		(ts.isObjectLiteralExpression(node) &&
			Array.length(node.properties) <= 5 &&
			!Array.some(node.properties, ts.isSpreadAssignment)) ||
		(ts.isArrayLiteralExpression(node) && Array.length(node.elements) <= 5)
	)
}

function isTopLevelSingleUseInlineableExpression(node: ts.VariableDeclaration, references: Map<string, number>) {
	return (
		isTopLevelVariableDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		!isTanStackRouteDeclaration(node) &&
		!!node.initializer &&
		(references.get(node.name.text) === 1 ||
			(isExportedVariableDeclaration(node) && isSmallCollectionConstructor(node.initializer))) &&
		isInlineableTopLevelExpression(node.initializer)
	)
}

function isTanStackRouteDeclaration(node: ts.VariableDeclaration) {
	return (
		ts.isIdentifier(node.name) &&
		node.name.text === 'Route' &&
		isExportedVariableDeclaration(node) &&
		!!node.initializer &&
		ts.isCallExpression(node.initializer) &&
		ts.isCallExpression(node.initializer.expression) &&
		ts.isIdentifier(node.initializer.expression.expression) &&
		node.initializer.expression.expression.text === 'createFileRoute'
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
		report(name, 'no-arg-destructuring', 'Replace parameter destructuring with named parameter plus property access.')
	}

	if (!ts.isFunctionDeclaration(node) && isBranchGrowingHelper(node) && name.text.startsWith('get')) {
		report(name, 'no-helper-branch-growth', 'Move helper branch logic to each concrete call site.')
	}

	if (hasDefaultParameter(node)) {
		report(name, 'no-configurable-helper', 'Inline configurable helper policy at each call site.')
	}

	if (isNamedArrowOrFunctionExpression(node)) {
		report(name, 'no-arrow-for-named', 'Rewrite named arrow as `function name(...) { ... }`.')
	}

	if (returnsEffectFromPlainFunction(node, checker)) {
		report(name, 'no-effect-returning-function', effectReturningFunctionMessage(node))
	}

	if (
		node.type &&
		!RegExp('^(is|has)').test(name.text) &&
		!isRecursiveFunctionLike(node, name.text) &&
		!ts.isTypePredicateNode(node.type) &&
		node.type.kind !== ts.SyntaxKind.TypePredicate &&
		node.type.kind !== ts.SyntaxKind.BooleanKeyword
	) {
		report(node.type, 'no-return-type-annotation', 'Remove return type annotation.')
	}

	if (isNamedArrowOrFunctionExpression(node) && references.get(name.text) === 1) {
		report(name, 'no-single-expression-function', 'Inline single-use function at its call site.')
	}

	const expression = getSingleReturnedExpression(node)

	if (!expression) return

	if (isAccessExpression(expression)) {
		return report(name, 'no-access-helper', 'Inline property access at each helper call site.')
	}

	if (ts.isCallExpression(expression) && isEffectGenCall(expression)) {
		report(name, 'no-effect-antipatterns', effectReturningFunctionMessage(node))
	}

	if ((isNamedArrowOrFunctionExpression(node) || ts.isFunctionDeclaration(node)) && ts.isCallExpression(expression)) {
		if (!isEffectGenCall(expression)) {
			let reportedSpecificRule = false

			if (!isExportedPolicyWrapper(node, expression) && isPassThroughCall(node, expression)) {
				report(name, 'no-pass-through-function', 'Inline pass-through function at each call site.')
				reportedSpecificRule = true
			}

			if (!isExportedPolicyWrapper(node, expression) && isCallShapeAdapter(expression)) {
				report(name, 'no-call-shape-adapter', 'Call target directly with final argument shape.')
				reportedSpecificRule = true
			}

			if (!isExportedPolicyWrapper(node, expression) && isLowValueSignatureWrapper(node, expression)) {
				report(name, 'no-signature-wrapper', 'Call target directly with final arguments.')
				reportedSpecificRule = true
			}

			if (!reportedSpecificRule && isLowReviewValuePrivateFunction(node, name, expression, references)) {
				report(name, 'no-low-value-function', 'Inline low-value helper at each call site.')
			}
		}

		return
	}

	if (isLowReviewValuePrivateFunction(node, name, expression, references)) {
		report(name, 'no-low-value-function', 'Inline low-value helper at each call site.')
	} else if (isOneLineSimpleReturnHelper(node, expression)) {
		report(name, 'no-one-line-function', 'Inline one-expression function at each call site.')
		report(name, 'no-simple-function-variables', 'Inline helper expression at each call site.')
	}
}

function isOneLineSimpleReturnHelper(node: ts.FunctionLikeDeclaration, expression: ts.Expression) {
	return (
		(isNamedArrowOrFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
		!isExportedFunctionLike(node) &&
		!ts.isCallExpression(expression) &&
		isSimpleInlineableReturnExpression(expression)
	)
}

function isLowReviewValuePrivateFunction(
	node: ts.FunctionLikeDeclaration,
	name: ts.Identifier,
	expression: ts.Expression,
	references: Map<string, number>
) {
	return (
		(ts.isFunctionDeclaration(node) || isNamedArrowOrFunctionExpression(node)) &&
		!isExportedFunctionLike(node) &&
		!isRecursiveFunctionLike(node, name.text) &&
		(isSimpleInlineableReturnExpression(expression) ||
			expressionComplexity(expression) <= lowValueFunctionComplexityLimit(node, name, references))
	)
}

function lowValueFunctionComplexityLimit(
	node: ts.FunctionLikeDeclaration,
	name: ts.Identifier,
	references: Map<string, number>
) {
	return references.get(name.text) === 1 ? 42 : 28 + Array.length(node.parameters) * 4
}

function expressionComplexity(node: ts.Node): number {
	return 1 + Array.reduce(childNodes(node), 0, (total, child) => total + expressionComplexity(child))
}

function childNodes(node: ts.Node) {
	const children = Array.empty<ts.Node>()

	ts.forEachChild(node, child => {
		children.push(child)
	})

	return children
}

function isSimpleInlineableReturnExpression(node: ts.Expression) {
	return (
		ts.isIdentifier(node) ||
		isPrimitiveLiteral(node) ||
		isSmallLiteralContainer(node) ||
		isSimpleCondition(node) ||
		isDerivedSimpleExpression(node)
	)
}

function isRecursiveFunctionLike(node: ts.FunctionLikeDeclaration, name: string) {
	return node.body ? containsIdentifierReference(node.body, name) : false
}

function isRecursiveVariableFunction(node: ts.VariableDeclaration) {
	return (
		ts.isIdentifier(node.name) && !!node.initializer && containsIdentifierReference(node.initializer, node.name.text)
	)
}

function returnsEffectFromPlainFunction(node: ts.FunctionLikeDeclaration, checker?: ts.TypeChecker) {
	return (
		(ts.isFunctionDeclaration(node) || isNamedArrowOrFunctionExpression(node)) &&
		!isEffectFnUntracedCallback(node) &&
		Array.some(returnExpressions(node), expression => isEffectExpression(expression, checker))
	)
}

function effectReturningFunctionMessage(node: ts.FunctionLikeDeclaration) {
	return Array.isReadonlyArrayNonEmpty(node.parameters)
		? 'Replace arg Effect function with Effect.fnUntraced(function* (...) { ... }).'
		: 'Replace no-arg Effect function with const Effect.gen(function* () { ... }).'
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

function isIdentityBearingExpression(node: ts.Expression): boolean {
	return (
		isIdentityBearingCall(node) ||
		(ts.isTemplateExpression(node) &&
			Array.some(node.templateSpans, span => isIdentityBearingExpression(span.expression))) ||
		(ts.isBinaryExpression(node) && (isIdentityBearingExpression(node.left) || isIdentityBearingExpression(node.right)))
	)
}

function isIdentityBearingCall(node: ts.Expression): boolean {
	return (
		ts.isCallExpression(node) &&
		((ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			((node.expression.expression.text === 'crypto' && node.expression.name.text === 'randomUUID') ||
				(node.expression.expression.text === 'Math' && node.expression.name.text === 'random'))) ||
			(ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.expression) &&
				Array.contains(['Random', 'DateTime'], node.expression.expression.text)))
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
		(ts.isConditionalExpression(node) && !String.includes('\n')(node.getText(node.getSourceFile())))
	)
}
