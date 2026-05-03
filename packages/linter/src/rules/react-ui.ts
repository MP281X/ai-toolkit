import {Array} from 'effect'

import ts from 'typescript'

import {functionReturnsJsx, isJsxLike, isTailwindStringLiteral, isUppercaseIdentifier} from '#lib/utils.ts'

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
