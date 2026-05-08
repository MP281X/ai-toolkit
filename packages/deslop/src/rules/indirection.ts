import {Array, Predicate} from 'effect'

import ts from 'typescript'

import {
	bindingNames,
	callName,
	isBooleanExpression,
	isCheapExpression,
	isPipeCall,
	isReactHookTupleCall,
	normalizedText,
	returnedExpression
} from '#lib/ts.ts'
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

export const indirectionRules = [
	rule('no-destructuring-except-react-hook-tuples', (node, context) => {
		if (
			ts.isVariableDeclaration(node) &&
			(ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))
		) {
			if (ts.isArrayBindingPattern(node.name) && node.initializer && isReactHookTupleCall(node.initializer)) return
			context.report(
				node.name,
				'no-destructuring-except-react-hook-tuples',
				`"${bindingNames(node.name)[0]?.text ?? normalizedText(node.name)}" creates a destructuring alias. Replace every use with direct property access on the source value, then delete the destructuring.`
			)
		}
		if (ts.isParameter(node) && (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))) {
			context.report(
				node.name,
				'no-destructuring-except-react-hook-tuples',
				`"${normalizedText(node.name)}" destructures a parameter. Use one named parameter, read properties directly from it, and do not add another local alias.`
			)
		}
	}),
	rule('no-access-alias', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (isExemptNamedValue(context.checker, node)) return
		if (isAccessAliasInitializer(node.initializer)) {
			context.report(
				node.name,
				'no-access-alias',
				`"${node.name.text}" only aliases "${normalizedText(node.initializer)}". Replace each use with the original expression and delete the alias.`
			)
		}
		if ((context.references.get(node.name.text) ?? 0) === 1 && isConstVariable(node)) {
			context.report(
				node.name,
				'no-access-alias',
				`"${node.name.text}" is a single-use constant alias. Move the initializer to the use site and delete the constant.`
			)
		}
	}),
	rule('no-boolean-expression-alias', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (!isBooleanExpression(node.initializer)) return
		context.report(
			node.name,
			'no-boolean-expression-alias',
			`"${node.name.text}" hides a condition behind a name. Put the full boolean expression where it is consumed and delete the alias.`
		)
	}),
	rule('no-config-objects', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)) return
		if (!Array.contains(['cases', 'config', 'configs', 'options', 'testCases'] as const, node.name.text)) return
		if (!(ts.isObjectLiteralExpression(node.initializer) || ts.isArrayLiteralExpression(node.initializer))) return
		context.report(
			node.name,
			'no-config-objects',
			`"${node.name.text}" stores test/config data behind an indirection. Move each literal value to the call site that uses it and delete the shared object.`
		)
	}),
	rule('no-inlineable-literal-constant', (node, context) => {
		if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isConstVariable(node))) {
			return
		}
		if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) {
			if (Array.some(node.parent.parent.modifiers ?? [], modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
				return
			}
		}
		if (ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length <= 5) {
			context.report(
				node.name,
				'no-inlineable-literal-constant',
				`"${node.name.text}" is a small array literal. Put the array literal directly at each use site and delete the constant.`
			)
		}
		if (
			ts.isObjectLiteralExpression(node.initializer) &&
			(node.initializer.properties.length <= 5 ||
				Array.every(node.initializer.properties, property => {
					return (
						ts.isShorthandPropertyAssignment(property) ||
						(ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer))
					)
				}))
		) {
			context.report(
				node.name,
				'no-inlineable-literal-constant',
				`"${node.name.text}" is an inlineable object literal. Put the object literal directly at each use site and delete the constant.`
			)
		}
	}),
	rule('prefer-pipe-for-transform-sequences', (node, context) => {
		if (!ts.isBlock(node)) return
		const chain = linearVariableChain(node, declaration => countIdentifierUses(node, declaration.name.text) === 2)
		if (chain.length < 2 || !chain[0]) return
		context.report(
			chain[0].name,
			'prefer-pipe-for-transform-sequences',
			`"${Array.join(
				Array.map(chain, item => item.name.text),
				'", "'
			)}" are temporary variables in one transformation chain. Replace the chain with one pipe(...) expression and delete the intermediate variables.`
		)
	}),
	rule('no-trivial-local-helper', (node, context) => {
		if (!isNamedFunctionLike(node)) return
		if (isExportedDeclaration(node)) return
		const expression = returnedExpression(node)
		if (expression && isPipeCall(expression)) {
			context.report(
				nameNode(node),
				'no-trivial-local-helper',
				`"${functionLikeName(node)}" only returns pipe(...). Move the pipe expression to the call site and delete the helper.`
			)
			return
		}
		const call = expression ? unwrapAwait(expression) : undefined
		if (
			call &&
			ts.isCallExpression(call) &&
			callName(call) !== functionLikeName(node) &&
			call.arguments.length === node.parameters.length &&
			Array.every(call.arguments, (argument, index) => {
				return (
					node.parameters[index] !== undefined &&
					ts.isIdentifier(argument) &&
					argument.text === node.parameters[index].name.getText(context.sourceFile)
				)
			})
		) {
			context.report(
				nameNode(node),
				'no-trivial-local-helper',
				`"${functionLikeName(node)}" only forwards its arguments to "${normalizedText(call)}". Replace calls with the target call and delete the wrapper.`
			)
			return
		}
		if (expression && (isBooleanExpression(expression) || isFallbackExpression(expression))) {
			context.report(
				nameNode(node),
				'no-trivial-local-helper',
				`"${functionLikeName(node)}" only names a cheap predicate or fallback. Move the expression to each use site and delete the helper.`
			)
			return
		}
		if (
			ts.isFunctionDeclaration(node) &&
			node.name &&
			!isTopLevelExempt(node) &&
			!Array.some(
				Array.map(node.parameters, parameter => parameter.type),
				Predicate.isNotUndefined
			) &&
			(context.references.get(node.name.text) ?? 0) === 1 &&
			expression &&
			isCheapExpression(expression)
		) {
			context.report(
				node.name,
				'no-trivial-local-helper',
				`"${node.name.text}" is a cheap helper with one consumer. Move its return expression to the call site and delete the helper.`
			)
		}
	}),
	rule('no-equivalent-helper-duplicates', (node, context) => {
		if (!(ts.isFunctionDeclaration(node) && node.name)) return
		const previous = previousFunctionWithSameBody(node)
		if (previous) {
			context.report(
				node.name,
				'no-equivalent-helper-duplicates',
				`"${node.name.text}" duplicates "${previous.name?.text}". Keep one implementation, update callers to use it, and delete the duplicate.`
			)
		}
	}),
	rule('no-constant-variation-parameter', (node, context) => {
		if (!isNamedFunctionLike(node)) return
		const constant = Array.findFirst(node.parameters, parameter => {
			const name = parameter.name.getText(context.sourceFile)
			return context.references.get(name) === 1 && parameter.initializer !== undefined
		})
		if (constant._tag === 'Some') {
			context.report(
				constant.value.name,
				'no-constant-variation-parameter',
				`"${constant.value.name.getText(context.sourceFile)}" has a default but no real variation. Move the default value into the body or create separate explicit call paths.`
			)
		}
	}),
	rule('no-facade-object', (node, context) => {
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
			RegExp('^[A-Z]').test(node.name.text) &&
			Array.every(node.initializer.properties, property => {
				return (
					ts.isShorthandPropertyAssignment(property) ||
					(ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer))
				)
			})
		) {
			context.report(
				node.name,
				'no-facade-object',
				`"${node.name.text}" is an object facade over existing symbols. Use the symbols directly and delete the facade object.`
			)
		}
	}),
	rule('no-single-variant-abstraction', (node, context) => {
		if (!ts.isTypeAliasDeclaration(node)) return
		if (!(ts.isUnionTypeNode(node.type) && node.type.types.length === 1)) return
		context.report(
			node.name,
			'no-single-variant-abstraction',
			`"${node.name.text}" is a union with one variant. Replace references with the variant type and delete the union alias.`
		)
	}),
	rule('no-single-implementation-abstraction', (node, context) => {
		if (
			ts.isInterfaceDeclaration(node) &&
			Array.some(node.members, ts.isMethodSignature) &&
			(context.references.get(node.name.text) ?? 0) <= 1
		) {
			context.report(
				node.name,
				'no-single-implementation-abstraction',
				`"${node.name.text}" abstracts one implementation. Use the concrete implementation or direct object shape and delete the interface.`
			)
		}
	})
] as const satisfies readonly Rule[]
