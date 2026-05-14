import {Array} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {
	isAllowedNamedType,
	isAllowedNullLiteral,
	isArrayIsArrayCall,
	isExportedDeclaration,
	isInsideTypeName,
	isNullishComparison,
	isReactRefCurrentPropertySignature,
	isReactUseRefCall,
	isReactUseStateCall,
	isRecursiveFunction,
	nullishComparedExpression,
	rule
} from './helpers.ts'

import {
	containsNode,
	hasModifier,
	isImportedIdentifier,
	normalizedText,
	typeIncludesNullish,
	typeLooksReadonlyArray
} from '#lib/ts.ts'

export const baseTypeSafetyRules = [
	rule('prefer-readonly-types', (node, context) => {
		if (ts.isPropertySignature(node) && !hasModifier(node, ts.SyntaxKind.ReadonlyKeyword)) {
			if (ts.isIdentifier(node.name) && node.name.text === 'current') return
			if (isReactRefCurrentPropertySignature(node)) return
			context.report(node.name, 'prefer-readonly-types', {
				description: `Property "${node.name.getText(context.sourceFile)}" is mutable in a type shape.`,
				fix: 'Add readonly to this property signature.'
			})
		}
		if (ts.isArrayTypeNode(node) && !ts.isTypeOperatorNode(node.parent)) {
			if (
				ts.findAncestor(
					node,
					ancestor =>
						ts.isCallExpression(ancestor) &&
						isReactUseRefCall(context.checker, ancestor) &&
						Array.some(ancestor.typeArguments ?? [], argument => containsNode(argument, child => child === node))
				) ||
				ts.findAncestor(
					node,
					ancestor =>
						ts.isTypeReferenceNode(ancestor) &&
						ts.isQualifiedName(ancestor.typeName) &&
						ancestor.typeName.getText(ancestor.getSourceFile()) === 'React.RefObject'
				)
			) {
				return
			}
			context.report(node, 'prefer-readonly-types', {
				description: `Array type "${normalizedText(node)}" is mutable.`,
				fix: `Use readonly ${normalizedText(node)} or ReadonlyArray<${normalizedText(node.elementType)}> with the same element type.`
			})
		}
		if (
			ts.isTypeReferenceNode(node) &&
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Array' &&
			!isInsideTypeName(node.typeName)
		) {
			context.report(node.typeName, 'prefer-readonly-types', {
				description: 'Array<T> is mutable.',
				fix: 'Replace it with ReadonlyArray<T>.'
			})
		}
		if (ts.isTupleTypeNode(node) && !ts.isTypeOperatorNode(node.parent)) {
			if (
				ts.findAncestor(
					node,
					ancestor =>
						ts.isCallExpression(ancestor) &&
						isReactUseRefCall(context.checker, ancestor) &&
						Array.some(ancestor.typeArguments ?? [], argument => containsNode(argument, child => child === node))
				) ||
				ts.findAncestor(
					node,
					ancestor =>
						ts.isTypeReferenceNode(ancestor) &&
						ts.isQualifiedName(ancestor.typeName) &&
						ancestor.typeName.getText(ancestor.getSourceFile()) === 'React.RefObject'
				)
			) {
				return
			}
			context.report(node, 'prefer-readonly-types', {
				description: `Tuple type "${normalizedText(node)}" is mutable.`,
				fix: 'Prefix it with readonly.'
			})
		}
	}),
	rule('prefer-undefined-over-null', (node, context) => {
		if (ts.isCallExpression(node) && isReactUseRefCall(context.checker, node)) {
			for (const argument of node.arguments) {
				if (!ts.isIdentifier(argument) || argument.text !== 'undefined') break
				context.report(argument, 'prefer-undefined-over-null', {
					description: 'React refs are the exception: unmounted refs are null.',
					fix: 'Initialize this useRef call with null, not undefined.'
				})
				break
			}
		}
		if (node.kind === ts.SyntaxKind.NullKeyword && !isAllowedNullLiteral(context.checker, node)) {
			context.report(node, 'prefer-undefined-over-null', {
				description: 'Null is banned for internal absence.',
				fix: 'Use undefined, omit the property, or keep null only at an explicit schema/API boundary.'
			})
		}
		if (
			ts.isLiteralTypeNode(node) &&
			node.literal.kind === ts.SyntaxKind.NullKeyword &&
			!isAllowedNullLiteral(context.checker, node.literal)
		) {
			context.report(node, 'prefer-undefined-over-null', {
				description: 'Null in a type union models absence inconsistently.',
				fix: 'Replace null with undefined, or make the property optional.'
			})
		}
	}),
	rule('prefer-optional-property', (node, context) => {
		if (!(ts.isPropertySignature(node) && node.type && typeNodeIncludesUndefined(node.type))) return
		context.report(node.name, 'prefer-optional-property', {
			description: `Property "${node.name.getText(context.sourceFile)}" unions with undefined.`,
			fix: `Change it to "${node.name.getText(context.sourceFile)}?" and remove undefined from the property type.`
		})
	}),
	rule('no-redundant-type-syntax', (node, context) => {
		if (
			ts.isParameter(node) &&
			node.type &&
			(ts.isArrowFunction(node.parent) || ts.isFunctionExpression(node.parent))
		) {
			const callArgument = containingCallArgument(node.parent)
			if (
				context.checker &&
				(hasUnknownOrAnyContextualParameterType(context.checker, node) ||
					isEffectFnParameterNeedingAnnotation(context.checker, node) ||
					(callArgument &&
						hasGenericCallbackParameterType(
							context.checker,
							callArgument.call,
							callArgument.argument,
							parameterIndex(node)
						)))
			) {
				return
			}
			context.report(node.type, 'no-redundant-type-syntax', {
				description: `Callback parameter "${node.name.getText(context.sourceFile)}" repeats contextual typing.`,
				fix: 'Remove this parameter annotation; keep annotations only when context is any/unknown/generic.'
			})
		}
		if (ts.isVariableDeclaration(node) && node.type && node.initializer && context.checker) {
			if (isRecursiveEffectFnUntracedVariable(node)) return
			if (
				context.checker.isTypeAssignableTo(
					context.checker.getTypeAtLocation(node.initializer),
					context.checker.getTypeFromTypeNode(node.type)
				)
			) {
				context.report(node.type, 'no-redundant-type-syntax', {
					description: `Variable "${node.name.getText(context.sourceFile)}" annotation duplicates its initializer.`,
					fix: `Delete ": ${normalizedText(node.type)}" and keep the initializer.`
				})
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
			context.report(node.type, 'no-redundant-type-syntax', {
				description: `Return annotation on "${(ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name ? node.name.getText(context.sourceFile) : '<anonymous>'}" repeats the implementation.`,
				fix: `Delete ": ${normalizedText(node.type)}" and let TypeScript infer it.`
			})
		}
	}),
	rule('no-redundant-type-syntax', (node, context) => {
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
		if (!ts.isIdentifier(node.expression)) return
		if (isReactUseStateCall(context.checker, node) || isReactUseRefCall(context.checker, node)) return
		if (!context.checker.getResolvedSignature(node)) return
		context.report(node.typeArguments[0] ?? node, 'no-redundant-type-syntax', {
			description: `Generic arguments on "${normalizedText(node.expression)}" should infer from arguments.`,
			fix: `Remove <${Array.join(Array.map(node.typeArguments, normalizedText), ', ')}> without adding an assertion.`
		})
	}),
	rule('no-redundant-type-syntax', (node, context) => {
		if (!ts.isTypeParameterDeclaration(node)) return
		if (node.constraint?.kind === ts.SyntaxKind.UnknownKeyword || node.constraint?.kind === ts.SyntaxKind.AnyKeyword) {
			context.report(node.name, 'no-redundant-type-syntax', {
				description: `Type parameter "${node.name.text}" has a useless "extends ${normalizedText(node.constraint)}" constraint.`,
				fix: 'Remove the constraint.'
			})
			return
		}
	}),
	rule('no-unnecessary-named-type', (node, context) => {
		if (ts.isModuleDeclaration(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
			if (!hasModifier(node, ts.SyntaxKind.DeclareKeyword)) {
				context.report(node.name, 'no-unnecessary-named-type', {
					description: `Runtime namespace "${node.name.getText(context.sourceFile)}" is banned.`,
					fix: 'Export named values directly; only export declare namespace is allowed for type companions.'
				})
			}
			return
		}
		if (!ts.isTypeAliasDeclaration(node)) return
		if (!containsAccessorType(node.type)) return
		if (
			containsNode(
				node.type,
				child => ts.isTypeQueryNode(child) && entityNameRoot(child.exprName) === node.name.text
			) &&
			containsAccessorType(node.type)
		) {
			return
		}
		context.report(node.name, 'no-unnecessary-named-type', {
			description: `Type alias "${node.name.text}" only re-exports "${normalizedText(node.type)}".`,
			fix: 'Use the source type directly, unless this is a same-name typeof companion.'
		})
	}),
	rule('no-redundant-type-system-check', (node, context) => {
		if (!context.checker) return
		if (
			ts.isPropertyAccessExpression(node) &&
			node.questionDotToken &&
			!typeIncludesNullish(context.checker.getTypeAtLocation(node.expression))
		) {
			context.report(node.name, 'no-redundant-type-system-check', {
				description: `"${normalizedText(node.expression)}" is not nullish by type.`,
				fix: 'Replace "?." with "." here.'
			})
		}
		if (ts.isBinaryExpression(node)) {
			if (
				node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
				!containsNode(
					node.left,
					child =>
						(ts.isPropertyAccessExpression(child) ||
							ts.isElementAccessExpression(child) ||
							ts.isCallExpression(child)) &&
						child.questionDotToken !== undefined
				) &&
				!typeIncludesNullish(context.checker.getTypeAtLocation(node.left))
			) {
				context.report(node.operatorToken, 'no-redundant-type-system-check', {
					description: `"${normalizedText(node.left)}" is not nullish by type.`,
					fix: `Delete "?? ${normalizedText(node.right)}" and use the left expression.`
				})
			}
			if (
				isNullishComparison(node) &&
				!typeIncludesNullish(context.checker.getTypeAtLocation(nullishComparedExpression(node)))
			) {
				context.report(node, 'no-redundant-type-system-check', {
					description: `"${normalizedText(nullishComparedExpression(node))}" is not nullish by type.`,
					fix: 'Remove this unreachable nullish check and keep the non-nullish branch.'
				})
			}
		}
		if (
			ts.isCallExpression(node) &&
			isArrayIsArrayCall(node) &&
			node.arguments[0] &&
			typeLooksReadonlyArray(context.checker, node.arguments[0])
		) {
			context.report(node.expression, 'no-redundant-type-system-check', {
				description: `"${normalizedText(node.arguments[0])}" is already array-typed.`,
				fix: 'Remove Array.isArray and keep the array branch.'
			})
		}
	}),
	rule('no-unnecessary-named-type', (node, context) => {
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
				context.report(node.name, 'no-unnecessary-named-type', {
					description: `Local type "${node.name.text}" has too little reuse (${context.references.get(node.name.text) ?? 0} refs).`,
					fix: 'Inline the shape at uses, or export it if it is a real boundary.'
				})
			}
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

function isEffectFnParameterNeedingAnnotation(checker: ts.TypeChecker, node: ts.ParameterDeclaration) {
	if (!(ts.isFunctionExpression(node.parent) || ts.isArrowFunction(node.parent))) return false
	return (
		ts.isCallExpression(node.parent.parent) &&
		ts.isPropertyAccessExpression(node.parent.parent.expression) &&
		ts.isIdentifier(node.parent.parent.expression.expression) &&
		node.parent.parent.expression.expression.text === 'Effect' &&
		Array.contains(['fn', 'fnUntraced'] as const, node.parent.parent.expression.name.text) &&
		!Array.some(
			checker.getContextualType(node.parent.parent)?.getCallSignatures() ?? [],
			signature => signature.getParameters().length > 0
		)
	)
}

function hasGenericCallbackParameterType(
	checker: ts.TypeChecker,
	call: ts.CallExpression,
	argument: number,
	parameter: number
) {
	if (argument < 0 || parameter < 0) return false
	return Array.some(
		checker.getResolvedSignature(call)?.getDeclaration()?.parameters ?? [],
		(declaration, index) =>
			index === argument && callbackParameterTypeNeedsAnnotation(checker, declaration.type, parameter)
	)
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

function containingCallArgument(
	node: ts.Node
): {readonly call: ts.CallExpression; readonly argument: number} | undefined {
	if (ts.isSourceFile(node)) return
	if (ts.isExpression(node) && ts.isCallExpression(node.parent)) {
		return {argument: argumentIndex(node), call: node.parent}
	}
	return containingCallArgument(node.parent)
}
