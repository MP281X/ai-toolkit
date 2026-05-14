import {Array, Option, pipe, String} from 'effect'

import ts from 'typescript'

import {
	callName,
	containsNode,
	hasModifier,
	isAccessExpression,
	isAtomConstructorCall,
	isCheapExpression,
	isEffectCall,
	isEffectConstructorCall,
	isFlowCall,
	isHookCall,
	isImportedIdentifier,
	isRcMapConstructorCall,
	isSchemaExpression,
	normalizedText,
	previousStatement
} from '#lib/ts.ts'

export type Rule = {
	readonly id: string
	readonly run: (
		node: ts.Node,
		context: {
			readonly filePath: string
			readonly sourceFile: ts.SourceFile
			readonly checker?: ts.TypeChecker
			readonly program?: ts.Program
			readonly references: ReadonlyMap<string, number>
			readonly referenceFiles: ReadonlyMap<string, ReadonlySet<string>>
			readonly declarations: ReadonlyMap<string, ts.Declaration>
			readonly report: (
				node: ts.Node,
				rule: string,
				diagnostic: {readonly description: string; readonly fix: string}
			) => void
		}
	) => void
}

export type RuleScope = 'base' | 'react' | 'effect'

export const standardPrototypeMethods = new Map([
	['map', 'Array'],
	['filter', 'Array'],
	['flatMap', 'Array'],
	['reduce', 'Array'],
	['some', 'Array'],
	['every', 'Array'],
	['find', 'Array'],
	['includes', 'Array/String'],
	['slice', 'Array/String'],
	['join', 'Array'],
	['trim', 'String'],
	['toLowerCase', 'String'],
	['toUpperCase', 'String'],
	['startsWith', 'String'],
	['endsWith', 'String']
])

export function shouldRunRule(ruleId: string, filePath: string) {
	if (!/\.config\.[cm]?tsx?$/.test(filePath)) return true
	return (
		!Array.contains(['no-vacuous-abstraction', 'no-plain-class'] as const, ruleId) ||
		new Set([
			'no-type-assertion-except-as-const',
			'prefer-undefined-over-null',
			'no-redundant-type-system-check',
			'no-redundant-type-syntax'
		]).has(ruleId)
	)
}

export function scopedRuleId(scope: RuleScope, ruleId: string) {
	return `${scope}/${ruleId}`
}

export function rule(id: string, run: Rule['run']) {
	return {id, run}
}

export function isTailwindStringLiteral(node: ts.Expression) {
	return (
		ts.isStringLiteral(node) &&
		/(^|\s)(flex|grid|block|inline|hidden|p-|m-|w-|h-|text-|bg-|border|rounded)/.test(node.text)
	)
}

export function isConstVariable(node: ts.VariableDeclaration) {
	return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0
}

export function isMutated(name: string, sourceFile: ts.SourceFile) {
	return containsNode(
		sourceFile,
		node =>
			ts.isBinaryExpression(node) &&
			ts.isIdentifier(node.left) &&
			node.left.text === name &&
			isAssignmentOperator(node.operatorToken.kind)
	)
}

export function isAssignmentOperator(kind: ts.SyntaxKind) {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

export function isAllowedNullLiteral(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (ts.isCallExpression(node.parent) && isReactUseRefCall(checker, node.parent)) return true
	if (
		ts.isCallExpression(node.parent) &&
		ts.isPropertyAccessExpression(node.parent.expression) &&
		ts.isIdentifier(node.parent.expression.expression) &&
		node.parent.expression.expression.text === 'Schema' &&
		node.parent.expression.name.text === 'NullOr'
	) {
		return true
	}
	if (
		ts.findAncestor(
			node,
			ancestor =>
				ts.isCallExpression(ancestor) &&
				isReactUseRefCall(checker, ancestor) &&
				Array.some(ancestor.arguments, argument => containsNode(argument, child => child === node))
		)
	) {
		return true
	}
	if (
		ts.findAncestor(
			node,
			ancestor =>
				ts.isCallExpression(ancestor) &&
				isReactUseRefCall(checker, ancestor) &&
				Array.some(ancestor.typeArguments ?? [], argument => containsNode(argument, child => child === node))
		) ||
		(ts.isBinaryExpression(node.parent) &&
			isAssignmentOperator(node.parent.operatorToken.kind) &&
			ts.isPropertyAccessExpression(node.parent.left) &&
			node.parent.left.name.text === 'current')
	) {
		return true
	}
	if (
		ts.findAncestor(
			node,
			ancestor =>
				ts.isTypeReferenceNode(ancestor) &&
				ts.isQualifiedName(ancestor.typeName) &&
				ancestor.typeName.getText(ancestor.getSourceFile()) === 'React.RefObject'
		) ||
		ts.findAncestor(
			node,
			ancestor => ts.isPropertySignature(ancestor) && ts.isIdentifier(ancestor.name) && ancestor.name.text === 'current'
		)
	) {
		return true
	}
	return false
}

export function isReactUseRefCall(checker: ts.TypeChecker | undefined, node: ts.CallExpression) {
	return isReactHookCall(checker, node, 'useRef')
}

export function isReactUseStateCall(checker: ts.TypeChecker | undefined, node: ts.CallExpression) {
	return isReactHookCall(checker, node, 'useState')
}

function isReactHookCall(checker: ts.TypeChecker | undefined, node: ts.CallExpression, name: 'useRef' | 'useState') {
	if (ts.isIdentifier(node.expression)) {
		return checker ? isImportedIdentifier(checker, node.expression, 'react', name) : node.expression.text === name
	}
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === name &&
		(checker
			? isImportedIdentifier(checker, node.expression.expression, 'react', 'React')
			: node.expression.expression.getText(node.getSourceFile()) === 'React')
	)
}

export function isAccessAliasInitializer(node: ts.Expression) {
	if (isAccessExpression(node) || ts.isIdentifier(node)) return true
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		return isCheapExpression(node)
	}
	return false
}

export function isExemptNamedValue(checker: ts.TypeChecker | undefined, node: ts.VariableDeclaration) {
	if (!node.initializer) return false
	return (
		isEffectConstructorCall(node.initializer) ||
		(ts.isVariableDeclarationList(node.parent) &&
			ts.isVariableStatement(node.parent.parent) &&
			ts.isSourceFile(node.parent.parent.parent) &&
			(isAtomConstructorCall(checker, node.initializer) || isRcMapConstructorCall(checker, node.initializer))) ||
		isSchemaExpression(node.initializer) ||
		isFlowCall(node.initializer) ||
		isHookCall(node.initializer)
	)
}

export function isRecursiveFunction(node: ts.FunctionLikeDeclaration) {
	const name = functionLikeName(node)
	if (name === '<anonymous>') return false
	return !!node.body && containsNode(node.body, child => ts.isIdentifier(child) && child.text === name)
}

export function countIdentifierUses(node: ts.Node, name: string) {
	let count = 0
	function visit(child: ts.Node) {
		if (ts.isIdentifier(child) && child.text === name) count += 1
		ts.forEachChild(child, visit)
	}
	visit(node)
	return count
}

export function isNullishComparison(node: ts.BinaryExpression) {
	return (
		Array.contains(
			[
				ts.SyntaxKind.EqualsEqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsEqualsToken,
				ts.SyntaxKind.EqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsToken
			] as const,
			node.operatorToken.kind
		) &&
		(node.left.kind === ts.SyntaxKind.NullKeyword ||
			node.right.kind === ts.SyntaxKind.NullKeyword ||
			isUndefinedIdentifier(node.left) ||
			isUndefinedIdentifier(node.right))
	)
}

export function isUndefinedIdentifier(node: ts.Node) {
	return ts.isIdentifier(node) && node.text === 'undefined'
}

export function nullishComparedExpression(node: ts.BinaryExpression) {
	return node.left.kind === ts.SyntaxKind.NullKeyword || isUndefinedIdentifier(node.left) ? node.right : node.left
}

export function isArrayIsArrayCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Array' &&
		node.expression.name.text === 'isArray'
	)
}

export function isAllowedNamedType(node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration, sourceFile: ts.SourceFile) {
	if (hasModifier(node, ts.SyntaxKind.DeclareKeyword)) return true
	if (
		ts.isTypeAliasDeclaration(node) &&
		containsNode(node.type, child => ts.isTypeQueryNode(child) || String.includes('Brand')(child.getText(sourceFile)))
	) {
		return true
	}
	return containsNode(node, child => ts.isIdentifier(child) && child.text === node.name.text && child !== node.name)
}

export function isNamedFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		(ts.isFunctionDeclaration(node) && !!node.name) ||
		((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
			ts.isVariableDeclaration(node.parent) &&
			ts.isIdentifier(node.parent.name))
	)
}

export function hasParameters(node: ts.FunctionLikeDeclaration) {
	return node.parameters.length > 0
}

export function nameNode(node: ts.FunctionLikeDeclaration) {
	if (ts.isFunctionDeclaration(node) && node.name) return node.name
	if (ts.isVariableDeclaration(node.parent)) return node.parent.name
	return node
}

export function functionLikeName(node: ts.FunctionLikeDeclaration) {
	if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
	if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text
	return '<anonymous>'
}

export function isEffectRunCall(node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		String.startsWith('run')(callName(node)) &&
		(node.expression.expression.text === 'Effect' || String.endsWith('Runtime')(node.expression.expression.text))
	)
}

export function isComposedEffectArgument(node: ts.Expression) {
	return (
		ts.isCallExpression(node.parent) &&
		Array.some(node.parent.arguments, argument => argument === node) &&
		isEffectCall(node.parent)
	)
}

export function isDataFirstEffectOperation(node: ts.CallExpression) {
	return (
		isEffectCall(node) &&
		Array.contains(['as', 'asVoid', 'map', 'flatMap', 'tap', 'catch', 'catchTag', 'provide'] as const, callName(node))
	)
}

export function isEffectModuleReceiver(checker: ts.TypeChecker | undefined, node: ts.Expression) {
	return (
		isImportedIdentifier(checker, node, 'effect', 'Array') ||
		isImportedIdentifier(checker, node, 'effect', 'String') ||
		isImportedIdentifier(checker, node, 'effect', 'Record') ||
		isImportedIdentifier(checker, node, 'effect', 'Number') ||
		isImportedIdentifier(checker, node, 'effect', 'Predicate') ||
		isImportedIdentifier(checker, node, 'effect', 'Effect') ||
		isImportedIdentifier(checker, node, 'effect', 'Option')
	)
}

export function linearVariableChain(
	block: ts.Block,
	shouldChain: (
		declaration: ts.VariableDeclaration & {readonly name: ts.Identifier; readonly initializer: ts.Expression}
	) => boolean
) {
	return Array.reduce(
		pipe(
			block.statements,
			Array.filter(ts.isVariableStatement),
			Array.flatMap(statement => statement.declarationList.declarations),
			Array.filter(
				(
					declaration
				): declaration is ts.VariableDeclaration & {
					readonly name: ts.Identifier
					readonly initializer: ts.Expression
				} => ts.isIdentifier(declaration.name) && !!declaration.initializer
			)
		),
		Array.empty<
			ts.VariableDeclaration & {
				readonly name: ts.Identifier
				readonly initializer: ts.Expression
			}
		>(),
		(chain, declaration) => {
			if (Array.isReadonlyArrayEmpty(chain)) {
				return ts.isCallExpression(declaration.initializer) ? Array.append(chain, declaration) : chain
			}
			return pipe(
				Array.get(chain, Array.length(chain) - 1),
				Option.filter(shouldChain),
				Option.filter(previous =>
					containsNode(declaration.initializer, node => ts.isIdentifier(node) && node.text === previous.name.text)
				),
				Option.match({
					onNone: () => chain,
					onSome: () => Array.append(chain, declaration)
				})
			)
		}
	)
}

export function isMatchHandlerCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Match' &&
		Array.contains(['tag', 'when', 'orElse'] as const, node.expression.name.text)
	)
}

export function containsComments(node: ts.Node) {
	const text = node.getFullText(node.getSourceFile())
	return String.includes('//')(text) || String.includes('/*')(text)
}

export function isNullishPredicateExpression(node: ts.Expression) {
	return (
		ts.isBinaryExpression(node) &&
		Array.contains(
			[
				ts.SyntaxKind.ExclamationEqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsToken,
				ts.SyntaxKind.EqualsEqualsEqualsToken,
				ts.SyntaxKind.EqualsEqualsToken
			] as const,
			node.operatorToken.kind
		) &&
		(node.left.kind === ts.SyntaxKind.NullKeyword ||
			node.right.kind === ts.SyntaxKind.NullKeyword ||
			isUndefinedIdentifier(node.left) ||
			isUndefinedIdentifier(node.right))
	)
}

export function unwrapAwait(node: ts.Expression) {
	return ts.isAwaitExpression(node) ? node.expression : node
}

export function isTopLevelExempt(node: ts.FunctionDeclaration) {
	return hasModifier(node, ts.SyntaxKind.ExportKeyword) || node.asteriskToken !== undefined
}

export function isFallbackExpression(node: ts.Expression) {
	return (
		ts.isBinaryExpression(node) &&
		Array.contains([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken] as const, node.operatorToken.kind)
	)
}

export function isExportedDeclaration(node: ts.Node) {
	return (
		(ts.isFunctionDeclaration(node) ||
			ts.isClassDeclaration(node) ||
			ts.isInterfaceDeclaration(node) ||
			ts.isTypeAliasDeclaration(node) ||
			ts.isVariableStatement(node)) &&
		hasModifier(node, ts.SyntaxKind.ExportKeyword)
	)
}

export function isAllowedPublicDeclaration(node: ts.Node) {
	return ts.isClassDeclaration(node) && hasExtends(node)
}

export function nameNodeForDeclaration(node: ts.Node) {
	if (ts.isVariableStatement(node)) return node.declarationList
	if (
		(ts.isFunctionDeclaration(node) ||
			ts.isClassDeclaration(node) ||
			ts.isInterfaceDeclaration(node) ||
			ts.isTypeAliasDeclaration(node)) &&
		node.name
	) {
		return node.name
	}
	return node
}

export function isReactRefCurrent(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(checker && ts.isPropertyAccessExpression(node) && node.name.text === 'current')) return false
	return String.includes('RefObject<')(checker.typeToString(checker.getTypeAtLocation(node.expression)))
}

export function previousFunctionWithSameBody(node: ts.FunctionDeclaration) {
	let previous = previousStatement(node)
	while (previous) {
		if (
			ts.isFunctionDeclaration(previous) &&
			previous.body &&
			node.body &&
			normalizedText(previous.body) === normalizedText(node.body)
		) {
			return previous
		}
		previous = previousStatement(previous)
	}
	return
}

export function hasExtends(node: ts.ClassDeclaration) {
	return Array.some(node.heritageClauses ?? [], clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
}
