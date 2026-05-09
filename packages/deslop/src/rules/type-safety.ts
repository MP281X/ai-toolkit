import {Array} from 'effect'

import ts from 'typescript'

import {
	containsNode,
	hasModifier,
	isConstAssertion,
	isImportedIdentifier,
	isLiteralContainer,
	normalizedText,
	typeIncludesNullish,
	typeLooksReadonlyArray
} from '#lib/ts.ts'
import type {Rule} from './helpers.ts'
import {
	isAllowedNamedType,
	isAllowedNullLiteral,
	isArrayIsArrayCall,
	isConstVariable,
	isExportedDeclaration,
	isInsideTypeName,
	isMutated,
	isNullishComparison,
	isReactRefCurrentPropertySignature,
	isReactUseRefCall,
	isReactUseStateCall,
	isRecursiveFunction,
	nullishComparedExpression,
	rule
} from './helpers.ts'

export const typeSafetyRules = [
	rule('no-type-assertion-except-as-const', (node, context) => {
		if (ts.isAsExpression(node)) {
			if (isConstAssertion(node)) return
			context.report(
				node,
				'no-type-assertion-except-as-const',
				`"${normalizedText(node)}" forces a type without proof. Remove the assertion and fix the producer type or add a real runtime decode/refinement.`
			)
		}
		if (ts.isTypeAssertionExpression(node)) {
			context.report(
				node,
				'no-type-assertion-except-as-const',
				`"${normalizedText(node)}" forces a type without proof. Remove the assertion and make the value's source produce the correct type.`
			)
		}
		if (ts.isNonNullExpression(node)) {
			context.report(
				node,
				'no-type-assertion-except-as-const',
				`"${normalizedText(node)}" bypasses nullish checking. Remove the assertion and narrow the value with control flow before this use.`
			)
		}
		if (ts.isPropertyDeclaration(node) && node.exclamationToken) {
			context.report(
				node.name,
				'no-type-assertion-except-as-const',
				`"${node.name.getText(context.sourceFile)}" skips definite assignment checking. Initialize it from a proven value and remove the assertion token.`
			)
		}
	}),
	rule('prefer-strict-literal-const', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (
			!(isConstVariable(node) && isLiteralContainer(node.initializer)) ||
			isMutated(node.name.text, context.sourceFile)
		) {
			return
		}
		if (ts.isAsExpression(node.initializer) && isConstAssertion(node.initializer)) return
		context.report(
			node.name,
			'prefer-strict-literal-const',
			`"${node.name.text}" is an immutable literal whose keys or values can widen. Add as const${node.type ? ' and use satisfies for the shape' : ''}; do not add another type assertion.`
		)
	}),
	rule('prefer-readonly-types', (node, context) => {
		if (ts.isPropertySignature(node) && !hasModifier(node, ts.SyntaxKind.ReadonlyKeyword)) {
			if (isReactRefCurrentPropertySignature(node)) return
			context.report(
				node.name,
				'prefer-readonly-types',
				`"${node.name.getText(context.sourceFile)}" declares mutable object shape. Add readonly to the property type.`
			)
		}
		if (ts.isArrayTypeNode(node) && !ts.isTypeOperatorNode(node.parent)) {
			context.report(
				node,
				'prefer-readonly-types',
				`"${normalizedText(node)}" is a mutable array type. Replace it with ReadonlyArray<T> using the same element type.`
			)
		}
		if (
			ts.isTypeReferenceNode(node) &&
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Array' &&
			!isInsideTypeName(node.typeName)
		) {
			context.report(node.typeName, 'prefer-readonly-types', '"Array<T>" is mutable. Replace it with ReadonlyArray<T>.')
		}
		if (ts.isTupleTypeNode(node) && !ts.isTypeOperatorNode(node.parent)) {
			context.report(node, 'prefer-readonly-types', 'This tuple type is mutable. Prefix the tuple type with readonly.')
		}
	}),
	rule('prefer-undefined-over-null', (node, context) => {
		if (ts.isCallExpression(node) && isReactUseRefCall(context.checker, node)) {
			for (const argument of node.arguments) {
				if (!ts.isIdentifier(argument) || argument.text !== 'undefined') break
				context.report(
					argument,
					'prefer-undefined-over-null',
					'React refs use null for the unmounted value. Initialize this ref with null.'
				)
				break
			}
		}
		if (node.kind === ts.SyntaxKind.NullKeyword && !isAllowedNullLiteral(context.checker, node)) {
			context.report(
				node,
				'prefer-undefined-over-null',
				'"null" is an internal absence value. Use undefined or omit the optional field instead.'
			)
		}
		if (
			ts.isLiteralTypeNode(node) &&
			node.literal.kind === ts.SyntaxKind.NullKeyword &&
			!isAllowedNullLiteral(context.checker, node.literal)
		) {
			context.report(
				node,
				'prefer-undefined-over-null',
				'"null" appears in a type union. Replace it with undefined or model absence with an optional property.'
			)
		}
	}),
	rule('prefer-optional-property', (node, context) => {
		if (!(ts.isPropertySignature(node) && node.type && typeNodeIncludesUndefined(node.type))) return
		context.report(
			node.name,
			'prefer-optional-property',
			`"${node.name.getText(context.sourceFile)}" uses "| undefined" for an object property. Use "?" on the property and remove undefined from the type.`
		)
	}),
	rule('no-any', (node, context) => {
		if (ts.isTypeNode(node) && node.kind === ts.SyntaxKind.AnyKeyword) {
			context.report(
				node,
				'no-any',
				'any disables type checking. Replace it with unknown plus decoding/refinement, or with the concrete type.'
			)
		}
	}),
	rule('no-redundant-type-annotation', (node, context) => {
		if (
			ts.isParameter(node) &&
			node.type &&
			(ts.isArrowFunction(node.parent) || ts.isFunctionExpression(node.parent)) &&
			ts.isCallExpression(node.parent.parent)
		) {
			if (
				context.checker &&
				(hasUnknownOrAnyContextualParameterType(context.checker, node) ||
					hasGenericCallbackParameterType(
						context.checker,
						node.parent.parent,
						argumentIndex(node.parent),
						parameterIndex(node)
					))
			) {
				return
			}
			if (
				ts.isFunctionExpression(node.parent) &&
				ts.isPropertyAccessExpression(node.parent.parent.expression) &&
				ts.isIdentifier(node.parent.parent.expression.expression) &&
				node.parent.parent.expression.expression.text === 'Effect' &&
				node.parent.parent.expression.name.text === 'fnUntraced'
			) {
				return
			}
			context.report(
				node.type,
				'no-callback-parameter-type-annotation',
				`"${node.name.getText(context.sourceFile)}" annotates a callback parameter. Remove the annotation by rewriting the surrounding call so the callback argument type is inferred.`
			)
		}
		if (ts.isVariableDeclaration(node) && node.type && node.initializer && context.checker) {
			if (isRecursiveEffectFnUntracedVariable(node)) return
			if (
				context.checker.isTypeAssignableTo(
					context.checker.getTypeAtLocation(node.initializer),
					context.checker.getTypeFromTypeNode(node.type)
				)
			) {
				context.report(
					node.type,
					'no-redundant-type-annotation',
					'This variable annotation duplicates the initializer type. Delete the annotation and keep the initializer unchanged.'
				)
			}
		}
		if (
			(ts.isFunctionDeclaration(node) ||
				ts.isFunctionExpression(node) ||
				ts.isArrowFunction(node) ||
				ts.isMethodDeclaration(node)) &&
			node.type &&
			node.body &&
			!isRecursiveFunction(node)
		) {
			if (ts.isTypePredicateNode(node.type)) return
			context.report(
				node.type,
				'no-redundant-type-annotation',
				'This function return annotation is unnecessary. Delete it and let the implementation define the return type.'
			)
		}
	}),
	rule('no-redundant-generic-type-argument', (node, context) => {
		if (!(ts.isCallExpression(node) && node.typeArguments?.length && context.checker)) return
		if (
			ts.isPropertyAccessExpression(node.expression) &&
			((isImportedIdentifier(context.checker, node.expression.expression, 'effect', 'Schema') &&
				Array.contains(['Class', 'TaggedClass', 'TaggedErrorClass'] as const, node.expression.name.text)) ||
				(isImportedIdentifier(context.checker, node.expression.expression, 'effect', 'Context') &&
					node.expression.name.text === 'Service'))
		) {
			return
		}
		if (
			ts.isPropertyAccessExpression(node.expression) &&
			isImportedIdentifier(context.checker, node.expression.expression, 'effect', 'Array')
		) {
			return
		}
		if (node.arguments.length === 0) return
		if (isReactUseStateCall(context.checker, node)) return
		if (isReactUseRefCall(context.checker, node)) {
			for (const argument of node.arguments) {
				if (
					argument.kind === ts.SyntaxKind.NullKeyword ||
					(ts.isIdentifier(argument) && argument.text === 'undefined')
				) {
					return
				}
				break
			}
		}
		if (!context.checker.getResolvedSignature(node)) return
		context.report(
			node.typeArguments[0] ?? node,
			'no-redundant-generic-type-argument',
			`"${normalizedText(node.expression)}" has an explicit generic argument that should be inferred. Remove the generic argument list without adding an annotation or assertion.`
		)
	}),
	rule('no-unnecessary-type-constraint', (node, context) => {
		if (!ts.isTypeParameterDeclaration(node)) return
		if (node.constraint?.kind === ts.SyntaxKind.UnknownKeyword || node.constraint?.kind === ts.SyntaxKind.AnyKeyword) {
			context.report(
				node.name,
				'no-unnecessary-type-constraint',
				`"${node.name.text}" has a type constraint that adds no information. Remove the constraint from the type parameter.`
			)
			return
		}
	}),
	rule('no-accessor-type-alias', (node, context) => {
		if (ts.isModuleDeclaration(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
			if (!hasModifier(node, ts.SyntaxKind.DeclareKeyword)) {
				context.report(
					node.name,
					'no-accessor-type-alias',
					'Runtime namespaces are banned. Use export declare namespace only for same-name type companions.'
				)
			}
			return
		}
		if (!ts.isTypeAliasDeclaration(node)) return
		if (!containsAccessorType(node.type)) return
		if (
			containsNode(node.type, child => {
				return ts.isTypeQueryNode(child) && entityNameRoot(child.exprName) === node.name.text
			}) &&
			containsAccessorType(node.type)
		) {
			return
		}
		context.report(
			node.name,
			'no-accessor-type-alias',
			`"${node.name.text}" re-exports an accessor type. Import and use the source type directly, unless this is a same-name companion using typeof ${node.name.text}.`
		)
	}),
	rule('no-redundant-type-system-check', (node, context) => {
		if (!context.checker) return
		if (
			ts.isPropertyAccessExpression(node) &&
			node.questionDotToken &&
			!typeIncludesNullish(context.checker.getTypeAtLocation(node.expression))
		) {
			context.report(
				node.name,
				'no-redundant-type-system-check',
				`"${normalizedText(node.expression)}" is not typed as nullish. Remove the optional chain and use normal property access.`
			)
		}
		if (ts.isBinaryExpression(node)) {
			if (
				node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
				!typeIncludesNullish(context.checker.getTypeAtLocation(node.left))
			) {
				context.report(
					node.operatorToken,
					'no-redundant-type-system-check',
					`"${normalizedText(node.left)}" is not typed as nullish. Delete the fallback and use the left expression directly.`
				)
			}
			if (
				isNullishComparison(node) &&
				!typeIncludesNullish(context.checker.getTypeAtLocation(nullishComparedExpression(node)))
			) {
				context.report(
					node,
					'no-redundant-type-system-check',
					`"${normalizedText(node)}" checks an unreachable nullish case. Delete the check and keep the branch that matches the static type.`
				)
			}
		}
		if (
			ts.isCallExpression(node) &&
			isArrayIsArrayCall(node) &&
			node.arguments[0] &&
			typeLooksReadonlyArray(context.checker, node.arguments[0])
		) {
			context.report(
				node.expression,
				'no-redundant-type-system-check',
				`"${normalizedText(node)}" checks a value already typed as an array. Delete the Array.isArray branch and use the value directly.`
			)
		}
	}),
	rule('no-floating-type-contract', (node, context) => {
		if (ts.isInterfaceDeclaration(node) && Array.some(node.members, ts.isMethodSignature)) return
		if (
			(ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
			!isExportedDeclaration(node) &&
			!isAllowedNamedType(node, context.sourceFile)
		) {
			if (
				(context.references.get(node.name.text) ?? 0) <= 1 ||
				(ts.isTypeAliasDeclaration(node) &&
					((ts.isUnionTypeNode(node.type) && node.type.types.length <= 5) ||
						(ts.isTypeLiteralNode(node.type) && node.type.members.length <= 5))) ||
				(ts.isInterfaceDeclaration(node) && node.members.length <= 5)
			) {
				context.report(
					node.name,
					'no-floating-type-contract',
					`"${node.name.text}" is a local type alias with too little reuse. Inline the shape at the use site, or export it if it is a real boundary.`
				)
			}
		}
	}),
	rule('no-broad-literal-annotation', (node, context) => {
		if (ts.isVariableDeclaration(node) && node.type && node.initializer && isLiteralContainer(node.initializer)) {
			context.report(
				node.type,
				'no-broad-literal-annotation',
				'This annotates a literal and widens it. Remove the annotation; use as const with satisfies only when a shape check is needed.'
			)
		}
	}),
	rule('no-effect-type-erasure', (node, context) => {
		if (
			ts.isTypeReferenceNode(node) &&
			ts.isQualifiedName(node.typeName) &&
			node.typeName.getText(context.sourceFile) === 'Effect.Effect' &&
			(node.typeArguments?.length ?? 0) < 2
		) {
			context.report(
				node,
				'no-effect-type-erasure',
				'Effect.Effect omits error or requirement parameters. Preserve the full Effect type arguments at this type reference.'
			)
		}
	})
] as const satisfies readonly Rule[]

function typeNodeIncludesUndefined(node: ts.TypeNode): boolean {
	if (node.kind === ts.SyntaxKind.UndefinedKeyword) return true
	if (ts.isUnionTypeNode(node)) return Array.some(node.types, typeNodeIncludesUndefined)
	if (ts.isParenthesizedTypeNode(node)) return typeNodeIncludesUndefined(node.type)
	return false
}

function containsAccessorType(node: ts.TypeNode) {
	if (ts.isTypeQueryNode(node) || ts.isIndexedAccessTypeNode(node)) return true
	if (ts.isTypeReferenceNode(node)) {
		return ts.isQualifiedName(node.typeName) || Array.some(node.typeArguments ?? [], containsAccessorType)
	}
	if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) return Array.some(node.types, containsAccessorType)
	if (ts.isArrayTypeNode(node)) return containsAccessorType(node.elementType)
	if (ts.isTypeOperatorNode(node)) return containsAccessorType(node.type)
	if (ts.isParenthesizedTypeNode(node)) return containsAccessorType(node.type)
	return false
}

function entityNameRoot(node: ts.EntityName): string {
	return ts.isIdentifier(node) ? node.text : entityNameRoot(node.left)
}

function isRecursiveEffectFnUntracedVariable(node: ts.VariableDeclaration) {
	if (!(ts.isIdentifier(node.name) && node.initializer)) return false
	return (
		ts.isCallExpression(node.initializer) &&
		ts.isPropertyAccessExpression(node.initializer.expression) &&
		ts.isIdentifier(node.initializer.expression.expression) &&
		node.initializer.expression.expression.text === 'Effect' &&
		node.initializer.expression.name.text === 'fnUntraced' &&
		containsNode(
			node.initializer,
			current => current !== node.name && ts.isIdentifier(current) && current.text === node.name.getText()
		)
	)
}

function hasUnknownOrAnyContextualParameterType(checker: ts.TypeChecker, node: ts.ParameterDeclaration) {
	if (!(ts.isArrowFunction(node.parent) || ts.isFunctionExpression(node.parent))) return false
	let index = 0
	for (const symbol of checker.getContextualType(node.parent)?.getCallSignatures()[0]?.getParameters() ?? []) {
		if (index === parameterIndex(node)) {
			return (checker.getTypeOfSymbolAtLocation(symbol, node).flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0
		}
		index += 1
	}
	return false
}

function hasGenericCallbackParameterType(
	checker: ts.TypeChecker,
	call: ts.CallExpression,
	argument: number,
	parameter: number
) {
	if (argument < 0 || parameter < 0) return false
	return Array.some(checker.getResolvedSignature(call)?.getDeclaration()?.parameters ?? [], (declaration, index) => {
		return index === argument && callbackParameterTypeNeedsAnnotation(checker, declaration.type, parameter)
	})
}

function callbackParameterTypeNeedsAnnotation(
	checker: ts.TypeChecker,
	node: ts.TypeNode | undefined,
	parameter: number
) {
	if (!node) return false
	if (!(ts.isFunctionTypeNode(node) && node.parameters[parameter]?.type)) return false
	return (
		node.parameters[parameter].type.kind === ts.SyntaxKind.UnknownKeyword ||
		node.parameters[parameter].type.kind === ts.SyntaxKind.AnyKeyword ||
		(ts.isTypeReferenceNode(node.parameters[parameter].type) &&
			ts.isIdentifier(node.parameters[parameter].type.typeName) &&
			Array.some(
				checker.getSymbolAtLocation(node.parameters[parameter].type.typeName)?.declarations ?? [],
				ts.isTypeParameterDeclaration
			))
	)
}

function parameterIndex(node: ts.ParameterDeclaration) {
	let index = 0
	for (const parameter of node.parent.parameters) {
		if (parameter === node) return index
		index += 1
	}
	return -1
}

function argumentIndex(node: ts.Expression) {
	if (!ts.isCallExpression(node.parent)) return -1
	let index = 0
	for (const argument of node.parent.arguments) {
		if (argument === node) return index
		index += 1
	}
	return -1
}
