import {Array, Option, pipe, String} from 'effect'

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

			if (ts.isCallExpression(node)) {
				analyzeCallExpression(node, report)
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
				report(node.name, 'no-tailwind-class-variables', 'Move Tailwind classes directly into className or cn(...).')
			}
		}
	}
]

function analyzeImportDeclaration(
	node: ts.ImportDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
		Array.forEach(node.importClause.namedBindings.elements, element => {
			if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'react' && element.isTypeOnly) {
				report(element.name, 'no-react-type-imports', 'Remove React type import; use global React.* annotation.')
			}

			if (element.propertyName && !hasTopLevelDeclarationNamed(node.getSourceFile(), element.propertyName.text)) {
				report(element.name, 'no-import-alias', 'Use original imported name.')
			}
		})
	}

	if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
		if (
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text !== 'react' &&
			node.importClause.namedBindings.name.text !== moduleNamespaceName(node.moduleSpecifier.text)
		) {
			report(node.importClause.namedBindings.name, 'no-import-alias', 'Use module basename as namespace import name.')
		}
	}

	if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'react' || !node.importClause) return

	if (
		node.importClause.isTypeOnly ||
		(node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))
	) {
		report(node.moduleSpecifier, 'no-react-type-imports', 'Remove React type import; use global React.* annotation.')
	}
}

function hasTopLevelDeclarationNamed(sourceFile: ts.SourceFile, name: string) {
	return Array.some(sourceFile.statements, statement => {
		if (
			(ts.isFunctionDeclaration(statement) ||
				ts.isClassDeclaration(statement) ||
				ts.isInterfaceDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement) ||
				ts.isEnumDeclaration(statement) ||
				ts.isModuleDeclaration(statement)) &&
			statement.name?.text === name
		) {
			return true
		}

		return (
			ts.isVariableStatement(statement) &&
			Array.some(
				statement.declarationList.declarations,
				declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name
			)
		)
	})
}

function analyzeCallExpression(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'useState' &&
		node.arguments[0]?.kind === ts.SyntaxKind.NullKeyword
	) {
		report(
			node.expression,
			'no-react-null-state',
			'Initialize React state with undefined, omitted state, or discriminated object.'
		)
	}
}

function moduleNamespaceName(moduleSpecifier: string) {
	return pipe(
		moduleSpecifier,
		String.split('/'),
		Array.last,
		Option.getOrElse(() => moduleSpecifier),
		basename => (String.startsWith('@effect/ai-')(moduleSpecifier) ? String.replace('ai-', '')(basename) : basename),
		String.split(RegExp('[^A-Za-z0-9_$]+')),
		Array.filter(String.isNonEmpty),
		Array.map(segment => (segment === 'openai' ? 'OpenAi' : String.capitalize(segment))),
		Array.join('')
	)
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
			report(node.name, 'no-jsx-wrapper-component', 'Inline wrapped JSX primitive at each call site.')
		}

		if (ts.isObjectLiteralExpression(node.initializer) && hasComponentNamespaceMember(node.initializer)) {
			report(node.name, 'no-component-namespace-object', 'Export concrete components directly.')
		}
	}
}

function analyzeFunctionDeclaration(
	node: ts.FunctionDeclaration,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (node.name && isUppercaseIdentifier(node.name) && isJsxWrapperFunction(node)) {
		report(node.name, 'no-jsx-wrapper-component', 'Inline wrapped JSX primitive at each call site.')
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
		report(node.name, 'no-render-prop-element', 'Render JSX directly at branch site.')
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
		report(node.name, 'cn-classname', 'Rewrite className ternary as className={cn(base, condition && className)}.')
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
			'Rewrite conditional class interpolation as className={cn(base, condition && className)}.'
		)
	}
}

function isJsxWrapperFunction(node: ts.FunctionLikeDeclaration) {
	return functionReturnsJsx(node) && Array.isReadonlyArrayNonEmpty(node.parameters) && hasJsxSpreadProps(node)
}

function hasJsxSpreadProps(node: ts.FunctionLikeDeclaration) {
	function visit(child: ts.Node): boolean {
		if (ts.isJsxSpreadAttribute(child)) return true

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
