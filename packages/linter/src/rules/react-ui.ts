import {Array, Option, pipe} from 'effect'

import ts from 'typescript'

import {
	functionReturnsJsx,
	isJsxLike,
	isNullishExpression,
	isTailwindStringLiteral,
	isUppercaseIdentifier
} from '#lib/utils.ts'

export const reactUiRules = [
	{
		name: 'react-ui-rules',
		apply(
			node: ts.Node,
			_references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			_checker?: ts.TypeChecker
		) {
			if (ts.isImportDeclaration(node)) {
				analyzeImportDeclaration(node, report)
			}

			if (ts.isVariableDeclaration(node)) {
				analyzeVariableDeclaration(node, report)
			}

			if (ts.isFunctionDeclaration(node)) {
				analyzeFunctionDeclaration(node, report)
			}

			if (ts.isJsxAttribute(node)) {
				analyzeJsxAttribute(node, report)
			}

			if (ts.isCallExpression(node)) {
				analyzeEffectCall(node, report)
			}

			if (
				ts.isPropertyAssignment(node) &&
				ts.isIdentifier(node.name) &&
				ts.isExpression(node.initializer) &&
				isTailwindStringLiteral(node.initializer)
			) {
				report(
					node.name,
					'no-tailwind-class-variables',
					'Do not store Tailwind class tokens in objects or config maps. Move the classes directly into className or className={cn(...)}.'
				)
			}
		}
	}
]

function analyzeImportDeclaration(
	node: ts.ImportDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		node.importClause?.namedBindings &&
		ts.isNamespaceImport(node.importClause.namedBindings) &&
		(!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'react')
	) {
		report(
			node.importClause.namedBindings.name,
			'no-namespace-import-alias',
			'Do not use namespace import aliases. Import the exact symbols so dependencies stay statically visible.'
		)
	}

	if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'react' || !node.importClause) {
		return
	}

	if (
		node.importClause.isTypeOnly ||
		(node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))
	) {
		report(
			node.moduleSpecifier,
			'no-react-type-imports',
			'Do not import React namespace from `react`. Named imports are preferred, or use global React types directly.'
		)
	}
}

function analyzeEffectCall(node: ts.CallExpression, report: (node: ts.Node, rule: string, message: string) => void) {
	if (!isReactEffectCall(node)) {
		return
	}

	const [callback, dependencies] = node.arguments

	if (!(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)))) {
		return
	}

	if (isFocusOnlyEffect(callback, dependencies)) {
		report(
			node.expression,
			'no-avoidable-use-effect',
			'This effect only moves focus. Prefer autoFocus, a callback ref, or the event that opened the focused element.'
		)
		return
	}

	if (isRefHandoffEffect(callback)) {
		report(
			node.expression,
			'no-avoidable-use-effect',
			'This effect only hands a value through a ref. Assign the ref where the imperative value is created.'
		)
		return
	}

	if (isDerivedStateEffect(callback)) {
		report(
			node.expression,
			'no-avoidable-use-effect',
			'This effect only derives React state from render inputs. Derive the value during render instead.'
		)
	}
}

function analyzeVariableDeclaration(
	node: ts.VariableDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (ts.isIdentifier(node.name) && isUppercaseIdentifier(node.name) && node.initializer) {
		if (
			(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
			isJsxWrapperFunction(node.initializer)
		) {
			report(
				node.name,
				'no-jsx-wrapper-component',
				'This component only wraps another JSX element and forwards props. Inline the wrapped primitive at the call site.'
			)
		}

		if (ts.isObjectLiteralExpression(node.initializer) && hasComponentNamespaceMember(node.initializer)) {
			report(
				node.name,
				'no-component-namespace-object',
				'Do not export component namespace objects. Export and import concrete components directly.'
			)
		}
	}
}

function analyzeFunctionDeclaration(
	node: ts.FunctionDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (node.name && isUppercaseIdentifier(node.name) && isJsxWrapperFunction(node)) {
		report(
			node.name,
			'no-jsx-wrapper-component',
			'This component only wraps another JSX element and forwards props. Inline the wrapped primitive at the call site.'
		)
	}
}

function analyzeJsxAttribute(node: ts.JsxAttribute, report: (node: ts.Node, rule: string, message: string) => void) {
	if (
		ts.isIdentifier(node.name) &&
		node.name.text === 'render' &&
		node.initializer &&
		ts.isJsxExpression(node.initializer) &&
		node.initializer.expression &&
		isJsxLike(node.initializer.expression)
	) {
		report(
			node.name,
			'no-render-prop-element',
			'Do not pass JSX through render props. Render the element directly where the branch is visible.'
		)
	}

	if (
		!ts.isIdentifier(node.name) ||
		node.name.text !== 'className' ||
		!node.initializer ||
		!ts.isJsxExpression(node.initializer)
	) {
		return
	}

	if (node.initializer.expression && ts.isConditionalExpression(node.initializer.expression)) {
		report(
			node.name,
			'cn-classname',
			'Do not use ternaries inside className. Use className={cn(base, condition && className)} so conditional classes stay explicit.'
		)
	}

	if (
		node.initializer.expression &&
		ts.isTemplateExpression(node.initializer.expression) &&
		Array.some(
			node.initializer.expression.templateSpans,
			span =>
				ts.isConditionalExpression(span.expression) ||
				(ts.isBinaryExpression(span.expression) &&
					(span.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
						span.expression.operatorToken.kind === ts.SyntaxKind.BarBarToken))
		)
	) {
		report(
			node.name,
			'cn-classname',
			'Do not interpolate conditional classes in className strings. Use className={cn(base, condition && className)} so conditional classes stay explicit.'
		)
	}
}

function isReactEffectCall(node: ts.CallExpression) {
	return (
		(ts.isIdentifier(node.expression) &&
			(node.expression.text === 'useEffect' || node.expression.text === 'useLayoutEffect')) ||
		(ts.isPropertyAccessExpression(node.expression) &&
			(node.expression.name.text === 'useEffect' || node.expression.name.text === 'useLayoutEffect'))
	)
}

function isFocusOnlyEffect(callback: ts.ArrowFunction | ts.FunctionExpression, dependencies: ts.Node | undefined) {
	return (
		((dependencies && ts.isArrayLiteralExpression(dependencies) && Array.isReadonlyArrayEmpty(dependencies.elements)) ||
			hasBooleanGatedFocus(callback)) &&
		pipe(effectStatements(callback), Array.every(isFocusOnlyStatement))
	)
}

function hasBooleanGatedFocus(callback: ts.ArrowFunction | ts.FunctionExpression) {
	return pipe(
		effectStatements(callback),
		Array.some(statement => ts.isIfStatement(statement))
	)
}

function isFocusOnlyStatement(statement: ts.Statement): boolean {
	if (ts.isExpressionStatement(statement)) {
		return isFocusCall(statement.expression)
	}

	return (
		ts.isIfStatement(statement) &&
		!statement.elseStatement &&
		(ts.isExpressionStatement(statement.thenStatement)
			? isFocusCall(statement.thenStatement.expression)
			: ts.isBlock(statement.thenStatement) &&
				pipe(
					statement.thenStatement.statements,
					singleStatement,
					Option.exists(child => ts.isExpressionStatement(child) && isFocusCall(child.expression))
				))
	)
}

function isFocusCall(node: ts.Expression) {
	return (
		ts.isCallExpression(node) &&
		Array.isReadonlyArrayEmpty(node.arguments) &&
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'focus'
	)
}

function isRefHandoffEffect(callback: ts.ArrowFunction | ts.FunctionExpression) {
	const statements = effectStatements(callback)
	const [assignmentStatement, returnStatement] = statements

	return (
		statements.length === 2 &&
		!!assignmentStatement &&
		!!returnStatement &&
		ts.isExpressionStatement(assignmentStatement) &&
		ts.isReturnStatement(returnStatement) &&
		isCurrentAssignment(assignmentStatement.expression) &&
		isRefCleanup(returnStatement.expression, assignmentStatement.expression.left)
	)
}

function isRefCleanup(node: ts.Expression | undefined, target: ts.LeftHandSideExpression) {
	if (!(node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)))) {
		return false
	}

	return node.body && ts.isBlock(node.body)
		? pipe(
				node.body.statements,
				singleStatement,
				Option.exists(
					child => ts.isExpressionStatement(child) && isMatchingNullishCurrentAssignment(child.expression, target)
				)
			)
		: ts.isExpression(node.body) && isMatchingNullishCurrentAssignment(node.body, target)
}

function singleStatement(statements: ts.NodeArray<ts.Statement>) {
	return pipe(
		statements,
		Array.get(0),
		Option.filter(() => pipe(statements, Array.get(1), Option.isNone))
	)
}

function isCurrentAssignment(node: ts.Expression): node is ts.AssignmentExpression<ts.EqualsToken> {
	return (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		ts.isPropertyAccessExpression(node.left) &&
		node.left.name.text === 'current'
	)
}

function isMatchingNullishCurrentAssignment(node: ts.Expression, target: ts.LeftHandSideExpression) {
	return isCurrentAssignment(node) && node.left.getText() === target.getText() && isNullishExpression(node.right)
}

function isDerivedStateEffect(callback: ts.ArrowFunction | ts.FunctionExpression) {
	const stateSetters = stateSetterNames(callback.getSourceFile())

	return (
		!effectReturnsCleanup(callback) &&
		stateSetters.size > 0 &&
		pipe(
			effectStatements(callback),
			Array.isReadonlyArrayNonEmpty,
			isNonEmpty =>
				isNonEmpty &&
				pipe(
					effectStatements(callback),
					Array.every(
						statement =>
							ts.isExpressionStatement(statement) &&
							ts.isCallExpression(statement.expression) &&
							ts.isIdentifier(statement.expression.expression) &&
							stateSetters.has(statement.expression.expression.text)
					)
				)
		)
	)
}

function effectReturnsCleanup(callback: ts.ArrowFunction | ts.FunctionExpression) {
	return (
		ts.isBlock(callback.body) &&
		pipe(
			callback.body.statements,
			Array.some(statement => ts.isReturnStatement(statement))
		)
	)
}

function stateSetterNames(sourceFile: ts.SourceFile) {
	const setters = new Set<string>()

	function visit(node: ts.Node) {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isArrayBindingPattern(node.name) &&
			node.initializer &&
			isUseStateCall(node.initializer)
		) {
			pipe(
				node.name.elements,
				Array.get(1),
				Option.map(element => {
					if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
						setters.add(element.name.text)
					}
				})
			)
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return setters
}

function isUseStateCall(node: ts.Expression) {
	return (
		ts.isCallExpression(node) &&
		((ts.isIdentifier(node.expression) && node.expression.text === 'useState') ||
			(ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'useState'))
	)
}

function effectStatements(callback: ts.ArrowFunction | ts.FunctionExpression) {
	return ts.isBlock(callback.body) ? callback.body.statements : Array.empty<ts.Statement>()
}

function isJsxWrapperFunction(node: ts.FunctionLikeDeclaration) {
	return functionReturnsJsx(node) && Array.isReadonlyArrayNonEmpty(node.parameters) && hasJsxSpreadProps(node)
}

function hasJsxSpreadProps(node: ts.FunctionLikeDeclaration) {
	function visit(child: ts.Node): boolean {
		if (ts.isJsxSpreadAttribute(child)) {
			return true
		}

		return !!ts.forEachChild(child, visit)
	}

	return node.body ? visit(node.body) : false
}

function hasComponentNamespaceMember(node: ts.ObjectLiteralExpression) {
	return Array.some(
		node.properties,
		property =>
			ts.isPropertyAssignment(property) &&
			(ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)) &&
			functionReturnsJsx(property.initializer)
	)
}
