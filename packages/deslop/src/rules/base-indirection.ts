import {Array} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {
	countIdentifierUses,
	functionLikeName,
	isAccessAliasInitializer,
	isConstVariable,
	isExemptNamedValue,
	isExportedDeclaration,
	isFallbackExpression,
	isNamedFunctionLike,
	isTopLevelExempt,
	linearVariableChain,
	nameNode,
	previousFunctionWithSameBody,
	rule,
	unwrapAwait
} from './helpers.ts'

import {
	bindingNames,
	callName,
	containsNode,
	isBooleanExpression,
	isConstAssertion,
	isHookCall,
	isPipeCall,
	isReactHookTupleCall,
	normalizedText,
	returnedExpression
} from '#lib/ts.ts'

export const baseIndirectionRules = [
	rule('no-destructuring', (node, context) => {
		if (
			ts.isVariableDeclaration(node) &&
			(ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))
		) {
			if (ts.isArrayBindingPattern(node.name) && node.initializer && isReactHookTupleCall(node.initializer)) return
			if (
				ts.isArrayBindingPattern(node.name) &&
				node.initializer &&
				context.checker?.isTupleType(context.checker.getTypeAtLocation(node.initializer))
			) {
				return
			}
			context.report(node.name, 'no-destructuring', {
				description: `Destructuring hides source "${node.initializer ? normalizedText(node.initializer) : '<unknown>'}".`,
				fix: `Replace ${Array.join(
					Array.map(bindingNames(node.name), name => name.text),
					', '
				)} with direct source property/index access, then delete the binding.`
			})
		}
		if (ts.isParameter(node) && (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))) {
			context.report(node.name, 'no-destructuring', {
				description: 'Parameter destructuring hides the argument object.',
				fix: `Name the parameter (for example props), then read ${normalizedText(node.name)} fields directly from it.`
			})
		}
	}),
	rule('no-single-use-local-binding', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (isExemptNamedValue(context.checker, node)) return
		if (isHookCall(node.initializer) || containsNode(node.initializer, child => isHookCall(child))) {
			return
		}
		if (isAccessAliasInitializer(node.initializer)) {
			context.report(node.name, 'no-single-use-local-binding', {
				description: `"${node.name.text}" only aliases "${normalizedText(node.initializer)}".`,
				fix: 'Replace all uses with that expression and delete this const.'
			})
		}
		if (localIdentifierUseCount(context.checker, node) === 1 && isConstVariable(node)) {
			context.report(node.name, 'no-single-use-local-binding', {
				description: `"${node.name.text}" has one use.`,
				fix: `Inline "${normalizedText(node.initializer)}" at that use and delete this const.`
			})
		}
	}),
	rule('no-pipe-method', (node, context) => {
		if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) return
		if (node.expression.name.text !== 'pipe') return
		context.report(node.expression.name, 'no-pipe-method', {
			description: `Method pipe call "${normalizedText(node.expression)}" hides the subject.`,
			fix: 'Use a direct module call for one operation, or the pipe(...) function for multi-step composition.'
		})
	}),
	rule('no-simple-local-binding', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (!isBooleanExpression(node.initializer)) return
		context.report(node.name, 'no-simple-local-binding', {
			description: `Boolean alias "${node.name.text}" hides "${normalizedText(node.initializer)}".`,
			fix: 'Inline the condition where consumed and delete this const.'
		})
	}),
	rule('no-simple-local-binding', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (!Array.contains(['cases', 'config', 'configs', 'options', 'testCases'] as const, node.name.text)) return
		if (!(ts.isObjectLiteralExpression(node.initializer) || ts.isArrayLiteralExpression(node.initializer))) return
		context.report(node.name, 'no-simple-local-binding', {
			description: `"${node.name.text}" is literal test/config data.`,
			fix: 'Move the object/array literal to the call site and delete this shared binding.'
		})
	}),
	rule('no-simple-local-binding', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isConstVariable(node))) {
			return
		}
		if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) {
			if (Array.some(node.parent.parent.modifiers ?? [], modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
				return
			}
		}
		if (
			ts.isStringLiteral(node.initializer) ||
			ts.isNumericLiteral(node.initializer) ||
			ts.isNoSubstitutionTemplateLiteral(node.initializer) ||
			node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
			node.initializer.kind === ts.SyntaxKind.FalseKeyword ||
			node.initializer.kind === ts.SyntaxKind.NullKeyword
		) {
			context.report(node.name, 'no-simple-local-binding', {
				description: `"${node.name.text}" only names literal ${normalizedText(node.initializer)}.`,
				fix: 'Inline the literal at each use and delete this const.'
			})
		}
		if (ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length <= 5) {
			context.report(node.name, 'no-simple-local-binding', {
				description: `"${node.name.text}" only names a ${node.initializer.elements.length}-item array.`,
				fix: 'Inline the array at each use and delete this const.'
			})
		}
		if (isSmallMapOrSetConstructor(node.initializer, context.references.get(node.name.text) ?? 0)) {
			context.report(node.name, 'no-simple-local-binding', {
				description: `"${node.name.text}" only names "${normalizedText(node.initializer)}".`,
				fix: 'Inline the constructor at each use and delete this const.'
			})
		}
		const initializer =
			ts.isAsExpression(node.initializer) &&
			isConstAssertion(node.initializer) &&
			ts.isExpression(node.initializer.expression)
				? node.initializer.expression
				: node.initializer
		if (
			ts.isObjectLiteralExpression(initializer) &&
			(initializer.properties.length <= 5 ||
				Array.every(
					initializer.properties,
					property =>
						ts.isShorthandPropertyAssignment(property) ||
						(ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer))
				))
		) {
			context.report(node.name, 'no-simple-local-binding', {
				description: `"${node.name.text}" only names a ${initializer.properties.length}-property object.`,
				fix: 'Inline the object at each use and delete this const.'
			})
		}
	}),
	rule('prefer-pipe-for-transform-sequences', (node, context) => {
		if (!ts.isBlock(node)) return
		const chain = linearVariableChain(node, declaration => countIdentifierUses(node, declaration.name.text) === 2)
		if (chain.length < 2 || !chain[0]) return
		if (isHookCall(chain[0].initializer)) return
		context.report(chain[0].name, 'prefer-pipe-for-transform-sequences', {
			description: `Temporary chain ${Array.join(
				Array.map(chain, item => item.name.text),
				' -> '
			)} hides one transform pipeline.`,
			fix: 'Replace with one pipe(...) and delete the intermediate variables.'
		})
	}),
	rule('prefer-flow-for-pipe-callback', (node, context) => {
		if (!(ts.isArrowFunction(node) && node.parameters.length === 1 && ts.isCallExpression(node.body))) return
		if (!isPipeCall(node.body)) return
		if (!(node.parameters[0] && ts.isIdentifier(node.parameters[0].name))) return
		if (!(node.body.arguments[0] && ts.isIdentifier(node.body.arguments[0]))) return
		if (node.parameters[0].name.text !== node.body.arguments[0].text) return
		if (node.body.arguments.length < 2) return
		context.report(node, 'prefer-flow-for-pipe-callback', {
			description: `Callback only pipes parameter "${node.parameters[0].name.text}" through operations.`,
			fix: `Replace with flow(${Array.join(Array.map(Array.drop(node.body.arguments, 1), normalizedText), ', ')}).`
		})
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (!isNamedFunctionLike(node)) return
		if (isExportedDeclaration(node)) return
		const expression = returnedExpression(node)
		if (expression && isPipeCall(expression)) {
			context.report(nameNode(node), 'no-vacuous-abstraction', {
				description: `"${functionLikeName(node)}" only returns pipe(...).`,
				fix: 'Inline this pipe at call sites and delete the helper.'
			})
			return
		}
		const call = expression ? unwrapAwait(expression) : undefined
		if (
			call &&
			ts.isCallExpression(call) &&
			callName(call) !== functionLikeName(node) &&
			call.arguments.length === node.parameters.length &&
			Array.every(
				call.arguments,
				(argument, index) =>
					node.parameters[index] !== undefined &&
					ts.isIdentifier(argument) &&
					argument.text === node.parameters[index].name.getText(context.sourceFile)
			)
		) {
			context.report(nameNode(node), 'no-vacuous-abstraction', {
				description: `"${functionLikeName(node)}" only forwards to "${normalizedText(call)}".`,
				fix: 'Call the target directly and delete the wrapper.'
			})
			return
		}
		if (expression && (isBooleanExpression(expression) || isFallbackExpression(expression))) {
			context.report(nameNode(node), 'no-vacuous-abstraction', {
				description: `"${functionLikeName(node)}" only names "${normalizedText(expression)}".`,
				fix: 'Inline the expression at uses and delete the helper.'
			})
			return
		}
		if (
			expression &&
			(ts.isTemplateExpression(expression) ||
				ts.isNoSubstitutionTemplateLiteral(expression) ||
				ts.isStringLiteral(expression))
		) {
			context.report(nameNode(node), 'no-vacuous-abstraction', {
				description: `"${functionLikeName(node)}" only formats "${normalizedText(expression)}".`,
				fix: 'Inline the string expression at uses and delete the helper.'
			})
			return
		}
		if (
			ts.isFunctionDeclaration(node) &&
			node.name &&
			!isTopLevelExempt(node) &&
			(context.references.get(node.name.text) ?? 0) === 1 &&
			expression
		) {
			context.report(node.name, 'no-vacuous-abstraction', {
				description: `"${node.name.text}" has one consumer.`,
				fix: 'Inline its return expression at the call site and delete the helper.'
			})
		}
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (!(ts.isFunctionDeclaration(node) && node.name)) return
		const previous = previousFunctionWithSameBody(node)
		if (previous) {
			context.report(node.name, 'no-vacuous-abstraction', {
				description: `"${node.name.text}" duplicates "${previous.name?.text}".`,
				fix: 'Update callers to one implementation and delete the duplicate.'
			})
		}
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (!isNamedFunctionLike(node)) return
		const constant = Array.findFirst(
			node.parameters,
			parameter =>
				context.references.get(parameter.name.getText(context.sourceFile)) === 1 && parameter.initializer !== undefined
		)
		if (constant._tag === 'Some') {
			context.report(constant.value.name, 'no-vacuous-abstraction', {
				description: `Parameter "${constant.value.name.getText(context.sourceFile)}" has a default but no real variation.`,
				fix: 'Inline the default in the body or split explicit call paths.'
			})
		}
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (
			!(
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.initializer &&
				ts.isObjectLiteralExpression(node.initializer)
			)
		) {
			return
		}
		if (
			/^[A-Z]/.test(node.name.text) &&
			Array.every(
				node.initializer.properties,
				property =>
					ts.isShorthandPropertyAssignment(property) ||
					(ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer))
			)
		) {
			context.report(node.name, 'no-vacuous-abstraction', {
				description: `"${node.name.text}" is a facade over existing symbols.`,
				fix: 'Import/use the symbols directly and delete this object.'
			})
		}
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (!ts.isTypeAliasDeclaration(node)) return
		if (!(ts.isUnionTypeNode(node.type) && node.type.types.length === 1)) return
		context.report(node.name, 'no-vacuous-abstraction', {
			description: `Union "${node.name.text}" has one variant.`,
			fix: `Replace references with "${node.type.types[0] ? normalizedText(node.type.types[0]) : '<variant>'}" and delete the alias.`
		})
	}),
	rule('no-vacuous-abstraction', (node, context) => {
		if (
			ts.isInterfaceDeclaration(node) &&
			Array.some(node.members, ts.isMethodSignature) &&
			(context.references.get(node.name.text) ?? 0) <= 1
		) {
			context.report(node.name, 'no-vacuous-abstraction', {
				description: `Interface "${node.name.text}" has no meaningful polymorphism.`,
				fix: 'Use the concrete implementation/direct shape and delete the interface.'
			})
		}
	})
] as const satisfies readonly Rule[]

function isSmallMapOrSetConstructor(node: ts.Expression, referenceCount: number) {
	if (!ts.isNewExpression(node)) return false
	if (!(ts.isIdentifier(node.expression) && Array.contains(['Map', 'Set'] as const, node.expression.text))) return false
	if (!node.arguments?.[0]) return referenceCount <= 1
	return (
		ts.isArrayLiteralExpression(node.arguments[0]) && (node.arguments[0].elements.length <= 5 || referenceCount <= 1)
	)
}

function localIdentifierUseCount(checker: ts.TypeChecker | undefined, node: ts.VariableDeclaration) {
	if (!ts.isIdentifier(node.name)) return 0
	let count = 0
	const symbol = checker?.getSymbolAtLocation(node.name)
	function visit(child: ts.Node, name: string) {
		if (
			child !== node.name &&
			ts.isIdentifier(child) &&
			child.text === name &&
			(!symbol || checker?.getSymbolAtLocation(child) === symbol)
		) {
			count += 1
		}
		ts.forEachChild(child, nested => {
			visit(nested, name)
		})
	}
	visit(localScope(node), node.name.text)
	return count
}

function localScope(node: ts.Node): ts.Node {
	if (ts.isSourceFile(node.parent) || ts.isBlock(node.parent) || ts.isModuleBlock(node.parent)) return node.parent
	return localScope(node.parent)
}
