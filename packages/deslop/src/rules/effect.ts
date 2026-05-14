import {Array, Option, String} from 'effect'

import ts from 'typescript'

import type {Rule} from './helpers.ts'
import {
	functionLikeName,
	hasParameters,
	isComposedEffectArgument,
	isEffectModuleReceiver,
	isEffectRunCall,
	isNamedFunctionLike,
	nameNode,
	rule,
	standardPrototypeMethods
} from './helpers.ts'

import {
	callName,
	containsNode,
	isEffectCall,
	isLiteral,
	isMatchCall,
	isPipeCall,
	isRcMapConstructorCall,
	normalizedText,
	returnedExpression,
	typeLooksEffect
} from '#lib/ts.ts'

export const effectRules = [
	rule('prefer-effect-fn-untraced', (node, context) => {
		if (!(isNamedFunctionLike(node) && hasParameters(node) && context.checker)) return
		const expression = returnedExpression(node)
		if (expression && typeLooksEffect(context.checker, expression)) {
			context.report(nameNode(node), 'prefer-effect-fn-untraced', {
				description: `"${functionLikeName(node)}" takes parameters and returns Effect.`,
				fix: 'Rewrite as Effect.fnUntraced(function* (...) { ... }), yield Effects with yield*, return plain values.'
			})
		}
	}),
	rule('prefer-effect-gen-program', (node, context) => {
		if (!isNamedFunctionLike(node) || hasParameters(node) || !context.checker) return
		const expression = returnedExpression(node)
		if (expression && typeLooksEffect(context.checker, expression)) {
			context.report(nameNode(node), 'prefer-effect-gen-program', {
				description: `"${functionLikeName(node)}" has no parameters and only returns Effect.`,
				fix: 'Replace the function with a top-level Effect value; remove the extra call layer.'
			})
		}
	}),
	rule('no-floating-effect', (node, context) => {
		if (!ts.isExpressionStatement(node)) return
		if (!(context.checker && typeLooksEffect(context.checker, node.expression))) return
		if (isEffectRunCall(node.expression) || isComposedEffectArgument(node.expression)) return
		context.report(node.expression, 'no-floating-effect', {
			description: `Effect "${normalizedText(node.expression)}" is unused.`,
			fix: 'Yield* it in Effect.gen, return/compose it, or run it only at a runtime boundary.'
		})
	}),
	rule('prefer-top-level-rcmap', (node, context) => {
		if (!isRcMapConstructorCall(context.checker, node)) return
		const rootDeclaration = rootRcMapConstructorDeclaration(node)
		if (rootDeclaration) {
			if (
				ts.isIdentifier(rootDeclaration.name) &&
				rootDeclaration.name.text[0] !== undefined &&
				rootDeclaration.name.text[0] !== String.toUpperCase(rootDeclaration.name.text[0])
			) {
				context.report(rootDeclaration.name, 'prefer-top-level-rcmap', {
					description: `Top-level RcMap "${rootDeclaration.name.text}" must be PascalCase.`,
					fix: 'Rename it to an uppercase resource name.'
				})
			}
			return
		}
		context.report(node, 'prefer-top-level-rcmap', {
			description: 'RcMap.make is not module-scoped.',
			fix: 'Move this constructor to a top-level PascalCase const; keep RcMap.get/invalidate at use sites.'
		})
	}),
	rule('no-standard-prototype-methods', (node, context) => {
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const module = standardPrototypeMethods.get(node.expression.name.text)
			if (
				module &&
				!isEffectModuleReceiver(context.checker, node.expression.expression) &&
				ts.isIdentifier(node.expression.name) &&
				isStandardPrototypeMethod(context.checker, node.expression.name, module)
			) {
				context.report(node.expression.name, 'no-standard-prototype-methods', {
					description: `Prototype call "${normalizedText(node.expression)}" is banned.`,
					fix: `Use ${module}.${node.expression.name.text}(${normalizedText(node.expression.expression)}, ...) or pipe for chains.`
				})
			}
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression)
		) {
			if (isGlobalObjectConstructor(context.checker, node.expression.expression)) {
				context.report(node.expression.name, 'no-standard-prototype-methods', {
					description: `Object.${node.expression.name.text} is banned in Effect scope.`,
					fix: 'Use the matching Record/Struct helper, or write explicit object construction for intentional mutation.'
				})
			}
		}
	}),
	rule('no-option-constructor', (node, context) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.expression) &&
			node.expression.expression.text === 'Option' &&
			String.startsWith('from')(node.expression.name.text)
		) {
			context.report(node.expression.name, 'no-option-constructor', {
				description: `Option.${node.expression.name.text} adds Option indirection.`,
				fix: 'Keep a plain optional value with guards, optional chaining, or ?? undefined.'
			})
		}
	}),
	rule('prefer-effect-random', (node, context) => {
		if (!isCryptoRandomUuidCall(context.checker, node)) return
		context.report(node, 'prefer-effect-random', {
			description: `Crypto UUID call "${normalizedText(node)}" is banned.`,
			fix: 'Use yield* Random.nextUUIDv4 inside Effect code.'
		})
	}),
	rule('prefer-effect-catch-tag', (node, context) => {
		if (
			!(
				context.checker &&
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.expression) &&
				node.expression.expression.text === 'Effect' &&
				Array.contains(['catch', 'catchAll', 'catchIf', 'catchSome'] as const, node.expression.name.text)
			)
		) {
			return
		}
		const input = effectCatchInput(context.checker, node)
		if (!input) return
		const channels = effectChannels(context.checker, input)
		if (!channels) return
		if (channels.error.flags & ts.TypeFlags.Never) {
			context.report(node.expression, 'prefer-effect-catch-tag', {
				description: `"${normalizedText(node.expression)}" catches an Effect with error channel never.`,
				fix: 'Delete this unreachable catch.'
			})
			return
		}
		if (!Array.some(unionMembers(channels.error), member => !!context.checker?.getPropertyOfType(member, '_tag')))
			return
		context.report(node.expression, 'prefer-effect-catch-tag', {
			description: `Broad ${node.expression.name.text} on tagged error channel ${formatType(context.checker, channels.error, node)}.`,
			fix: 'Use Effect.catchTag/catchTags for the specific _tag cases.'
		})
	}),
	rule('prefer-schema-tagged-error', (node, context) => {
		if (ts.isClassDeclaration(node) && node.heritageClauses) {
			for (const clause of node.heritageClauses) {
				for (const inherited of clause.types) {
					if (
						ts.isExpressionWithTypeArguments(inherited) &&
						ts.isCallExpression(inherited.expression) &&
						ts.isPropertyAccessExpression(inherited.expression.expression) &&
						ts.isIdentifier(inherited.expression.expression.expression) &&
						inherited.expression.expression.expression.text === 'Data' &&
						inherited.expression.expression.name.text === 'TaggedError'
					) {
						context.report(inherited.expression.expression, 'prefer-schema-tagged-error', {
							description: `Data.TaggedError class "${node.name?.text ?? '<anonymous>'}" has no schema.`,
							fix: 'Extend Schema.TaggedErrorClass<...>()("Tag", fields).'
						})
					}
				}
			}
		}
		if (
			ts.isYieldExpression(node) &&
			node.asteriskToken &&
			node.expression &&
			ts.isCallExpression(node.expression) &&
			ts.isPropertyAccessExpression(node.expression.expression) &&
			ts.isIdentifier(node.expression.expression.expression) &&
			node.expression.expression.expression.text === 'Effect' &&
			node.expression.expression.name.text === 'fail'
		) {
			context.report(node, 'prefer-schema-tagged-error', {
				description: `Yield wraps "${normalizedText(node.expression.arguments[0] ?? node.expression)}" in Effect.fail.`,
				fix: 'For yieldable tagged errors use yield* error directly.'
			})
		}
	}),
	rule('prefer-effect-try', (node, context) => {
		if (ts.isAwaitExpression(node) && hasEffectTryPromiseCallbackAncestor(node.parent)) return
		if (ts.isAwaitExpression(node) && hasEffectGeneratorAncestor(node.parent)) {
			context.report(node, 'prefer-effect-try', {
				description: `Await "${normalizedText(node.expression)}" inside Effect code hides promise errors.`,
				fix: 'Replace with yield* Effect.tryPromise({ try: () => ..., catch }).'
			})
		}
	}),
	rule('prefer-yield-property-access', (node, context) => {
		if (!ts.isPropertyAccessExpression(node)) return
		const yieldExpression = yieldedReceiver(node.expression)
		if (!(yieldExpression?.expression && yieldExpression.asteriskToken)) return
		context.report(node.name, 'prefer-yield-property-access', {
			description: `Yielded Effect property access "${normalizedText(node)}" hides an Effect.map.`,
			fix: 'Map the yielded value through pipe(..., Effect.map(...)).'
		})
	}),
	rule('no-single-operation-pipe', (node, context) => {
		if (!isPipeCall(node)) return
		if (node.arguments.length === 1) {
			context.report(node.expression, 'no-single-operation-pipe', {
				description: `pipe(${node.arguments[0] ? normalizedText(node.arguments[0]) : '<subject>'}) has no operations.`,
				fix: 'Use the subject directly.'
			})
			return
		}
		if (node.arguments[0] && isPipeCall(node.arguments[0])) {
			context.report(node.expression, 'no-single-operation-pipe', {
				description: 'Nested pipe call adds no step.',
				fix: 'Merge the inner pipe operations into this pipe call.'
			})
			return
		}
		if (node.arguments.length !== 2 || !context.checker) return
		if (!node.arguments[0] || typeLooksEffect(context.checker, node.arguments[0])) return
		if (isMatchCall(node.arguments[0])) return
		context.report(node.expression, 'no-single-operation-pipe', {
			description: `pipe has one non-Effect operation "${node.arguments[1] ? normalizedText(node.arguments[1]) : '<operation>'}".`,
			fix: 'Call the module function directly; keep pipe for multi-step or Effect composition.'
		})
	}),
	rule('no-effect-without-semantics', (node, context) => {
		const yieldedMapping = effectGenYieldedMapping(context.checker, node)
		if (yieldedMapping) {
			context.report(node, 'no-effect-without-semantics', {
				description: `Effect.gen only maps yielded Effect "${normalizedText(yieldedMapping)}".`,
				fix: 'Replace with Effect.map(effect, value => ...) or Effect.flatMap(effect, value => ...); do not wrap it in Effect.gen.'
			})
			return
		}
		if (ts.isCallExpression(node) && isUnnecessaryEffectGen(context.checker, node)) {
			context.report(node.expression, 'no-effect-without-semantics', {
				description: 'Effect.gen only yields one Effect.',
				fix: 'Use the yielded Effect directly and delete the wrapper generator.'
			})
			return
		}
		const syncReturnedEffect = effectSyncReturnedExpression(context.checker, node)
		if (syncReturnedEffect) {
			context.report(node, 'no-effect-without-semantics', {
				description: `Effect.sync callback returns Effect "${normalizedText(syncReturnedEffect)}".`,
				fix: 'Remove Effect.sync and use the returned Effect directly; do not create Effect<Effect<...>>.'
			})
			return
		}
		if (
			ts.isCallExpression(node) &&
			isEffectCall(node) &&
			Array.contains(['succeed', 'sync'] as const, callName(node)) &&
			node.arguments[0] &&
			isLiteral(node.arguments[0]) &&
			!hasRequiredEffectCallbackAncestor(node.parent)
		) {
			context.report(node.expression, 'no-effect-without-semantics', {
				description: `Effect.${callName(node)} only wraps literal ${normalizedText(node.arguments[0])}.`,
				fix: 'Use the literal directly unless a required Effect callback needs an Effect.'
			})
		}
	}),
	rule('no-untyped-effect-error', (node, context) => {
		if (!context.checker) return
		if (ts.isCallExpression(node) && isEffectTryWithUntypedCatch(context.checker, node)) {
			context.report(node.expression, 'no-untyped-effect-error', {
				description: `Effect.${callName(node)} catch returns unknown/any/global Error.`,
				fix: 'Return a specific Schema.TaggedErrorClass value and store the original as cause if needed.'
			})
			return
		}
		if (!(ts.isCallExpression(node) || ts.isVariableDeclaration(node))) return
		const target = ts.isVariableDeclaration(node) ? node.initializer : node
		if (!target) return
		const channels = effectChannels(context.checker, target)
		if (!channels) return
		const problem = errorChannelProblem(context.checker, channels.error)
		if (!problem) return
		context.report(target, 'no-untyped-effect-error', {
			description: `Effect error channel is ${problem}: ${formatType(context.checker, channels.error, target)}.`,
			fix: 'Model failures as specific tagged errors.'
		})
	})
] as const satisfies readonly Rule[]

function isStandardPrototypeMethod(checker: ts.TypeChecker | undefined, name: ts.Identifier, module: string) {
	if (!checker) return false
	return Array.some(checker.getSymbolAtLocation(name)?.declarations ?? [], declaration => {
		return (
			(ts.isInterfaceDeclaration(declaration.parent) || ts.isClassDeclaration(declaration.parent)) &&
			((String.includes('Array')(module) &&
				Array.contains(['Array', 'ReadonlyArray'] as const, declaration.parent.name?.text ?? '')) ||
				(String.includes('String')(module) && declaration.parent.name?.text === 'String'))
		)
	})
}

function isGlobalObjectConstructor(checker: ts.TypeChecker | undefined, receiver: ts.Expression) {
	if (!checker) return false
	return checker.typeToString(checker.getTypeAtLocation(receiver)) === 'ObjectConstructor'
}

function rootRcMapConstructorDeclaration(node: ts.Node) {
	const statement = variableStatementContainingRcMapConstructor(node)
	if (!(statement && ts.isSourceFile(statement.parent))) return
	return Option.getOrUndefined(
		Array.findFirst(statement.declarationList.declarations, declaration => {
			return !!declaration.initializer && containsNode(declaration.initializer, child => child === node)
		})
	)
}

function variableStatementContainingRcMapConstructor(node: ts.Node): ts.VariableStatement | undefined {
	if (ts.isSourceFile(node) || ts.isClassLike(node)) return
	if (ts.isVariableStatement(node)) return node
	return variableStatementContainingRcMapConstructor(node.parent)
}

function hasRequiredEffectCallbackAncestor(node: ts.Node): boolean {
	if (ts.isSourceFile(node)) return false
	if (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'Effect' &&
		Array.contains(['catch', 'catchAll', 'catchTag', 'orElse'] as const, node.expression.name.text)
	) {
		return true
	}
	return hasRequiredEffectCallbackAncestor(node.parent)
}

function hasEffectGeneratorAncestor(node: ts.Node): boolean {
	if (ts.isSourceFile(node)) return false
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
		return isEffectGeneratorFunction(node)
	}
	return hasEffectGeneratorAncestor(node.parent)
}

function isEffectGeneratorFunction(node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression) {
	if (
		node.asteriskToken &&
		ts.isCallExpression(node.parent) &&
		((ts.isPropertyAccessExpression(node.parent.expression) &&
			ts.isIdentifier(node.parent.expression.expression) &&
			node.parent.expression.expression.text === 'Effect' &&
			Array.contains(['gen', 'fnUntraced'] as const, node.parent.expression.name.text)) ||
			ts.isIdentifier(node.parent.expression))
	) {
		return true
	}
	return false
}

function yieldedReceiver(node: ts.Expression): ts.YieldExpression | undefined {
	if (ts.isYieldExpression(node)) return node
	if (ts.isParenthesizedExpression(node)) return yieldedReceiver(node.expression)
}

function hasEffectTryPromiseCallbackAncestor(node: ts.Node): boolean {
	if (ts.isSourceFile(node)) return false
	if (
		(ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
		ts.isPropertyAssignment(node.parent) &&
		ts.isIdentifier(node.parent.name) &&
		node.parent.name.text === 'try' &&
		ts.isObjectLiteralExpression(node.parent.parent) &&
		ts.isCallExpression(node.parent.parent.parent) &&
		ts.isPropertyAccessExpression(node.parent.parent.parent.expression) &&
		ts.isIdentifier(node.parent.parent.parent.expression.expression) &&
		node.parent.parent.parent.expression.expression.text === 'Effect' &&
		node.parent.parent.parent.expression.name.text === 'tryPromise'
	) {
		return true
	}
	return hasEffectTryPromiseCallbackAncestor(node.parent)
}

function isCryptoRandomUuidCall(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) {
		return (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			isImportedCryptoRandomUuid(checker, node.expression)
		)
	}
	if (node.expression.name.text !== 'randomUUID') return false
	return (
		(ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'crypto') ||
		(ts.isPropertyAccessExpression(node.expression.expression) &&
			node.expression.expression.getText(node.getSourceFile()) === 'globalThis.crypto') ||
		isImportedCryptoNamespace(checker, node.expression.expression)
	)
}

function isImportedCryptoRandomUuid(checker: ts.TypeChecker | undefined, node: ts.Identifier) {
	if (!checker) return false
	return Array.some(checker.getSymbolAtLocation(node)?.declarations ?? [], declaration => {
		return (
			ts.isImportSpecifier(declaration) &&
			(declaration.propertyName ?? declaration.name).text === 'randomUUID' &&
			ts.isStringLiteral(declaration.parent.parent.parent.moduleSpecifier) &&
			Array.contains(['crypto', 'node:crypto'] as const, declaration.parent.parent.parent.moduleSpecifier.text)
		)
	})
}

function isImportedCryptoNamespace(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(checker && ts.isIdentifier(node))) return false
	return Array.some(checker.getSymbolAtLocation(node)?.declarations ?? [], declaration => {
		return (
			ts.isNamespaceImport(declaration) &&
			ts.isStringLiteral(declaration.parent.parent.moduleSpecifier) &&
			Array.contains(['crypto', 'node:crypto'] as const, declaration.parent.parent.moduleSpecifier.text)
		)
	})
}

function effectCatchInput(checker: ts.TypeChecker, node: ts.CallExpression) {
	if (node.arguments[0] && effectChannels(checker, node.arguments[0])) return node.arguments[0]
	if (!(ts.isCallExpression(node.parent) && isPipeCall(node.parent))) return
	let index = 0
	for (const argument of node.parent.arguments) {
		if (argument === node) return index === 1 ? node.parent.arguments[0] : undefined
		index += 1
	}
}

function effectChannels(checker: ts.TypeChecker, node: ts.Node) {
	const typeId = checker.getPropertyOfType(checker.getTypeAtLocation(node), '~effect/Effect')
	if (typeId) {
		const error = varianceReturnType(checker, checker.getTypeOfSymbolAtLocation(typeId, node), '_E', node)
		return error ? {error: error} : undefined
	}
}

function varianceReturnType(checker: ts.TypeChecker, type: ts.Type, propertyName: string, node: ts.Node) {
	const symbol = checker.getPropertyOfType(type, propertyName)
	if (!symbol) return
	const signatures = checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(symbol, node), ts.SignatureKind.Call)
	return signatures[0] ? checker.getReturnTypeOfSignature(signatures[0]) : undefined
}

function errorChannelProblem(checker: ts.TypeChecker, type: ts.Type) {
	const members = unionMembers(type)
	if (Array.some(members, member => (member.flags & ts.TypeFlags.Unknown) !== 0)) return 'unknown'
	if (Array.some(members, member => (member.flags & ts.TypeFlags.Any) !== 0)) return 'any'
	if (Array.some(members, member => checker.typeToString(member) === 'Error')) return 'global Error'
}

function unionMembers(type: ts.Type) {
	return type.isUnion() ? type.types : [type]
}

function formatType(checker: ts.TypeChecker, type: ts.Type, node: ts.Node) {
	return checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
}

function isUnnecessaryEffectGen(checker: ts.TypeChecker | undefined, node: ts.CallExpression) {
	if (!(checker && isEffectCall(node) && callName(node) === 'gen')) return false
	if (
		!(
			node.arguments[0] &&
			(ts.isFunctionExpression(node.arguments[0]) || ts.isArrowFunction(node.arguments[0])) &&
			ts.isBlock(node.arguments[0].body)
		)
	) {
		return false
	}
	if (node.arguments[0].body.statements.length !== 1) return false
	if (!node.arguments[0].body.statements[0]) return false
	let expression: ts.Expression | undefined
	if (ts.isReturnStatement(node.arguments[0].body.statements[0]))
		expression = node.arguments[0].body.statements[0].expression
	if (ts.isExpressionStatement(node.arguments[0].body.statements[0]))
		expression = node.arguments[0].body.statements[0].expression
	if (!(expression && ts.isYieldExpression(expression) && expression.asteriskToken && expression.expression))
		return false
	return !!effectChannels(checker, expression.expression)
}

function effectGenYieldedMapping(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(checker && ts.isCallExpression(node) && isEffectCall(node) && callName(node) === 'gen')) return
	if (
		!(
			node.arguments[0] &&
			(ts.isFunctionExpression(node.arguments[0]) || ts.isArrowFunction(node.arguments[0])) &&
			ts.isBlock(node.arguments[0].body)
		)
	) {
		return
	}
	if (node.arguments[0].body.statements.length !== 1) return
	if (
		!(
			node.arguments[0].body.statements[0] &&
			ts.isReturnStatement(node.arguments[0].body.statements[0]) &&
			node.arguments[0].body.statements[0].expression
		)
	)
		return
	const yielded = singleYieldExpression(node.arguments[0].body.statements[0].expression)
	if (!(yielded?.expression && yielded.asteriskToken)) return
	if (node.arguments[0].body.statements[0].expression === yielded) return
	if (!effectChannels(checker, yielded.expression)) return
	return yielded.expression
}

function singleYieldExpression(node: ts.Node) {
	let yielded: ts.YieldExpression | undefined
	let count = 0
	function visit(child: ts.Node) {
		if (ts.isYieldExpression(child) && child.asteriskToken) {
			yielded = child
			count += 1
		}
		ts.forEachChild(child, visit)
	}
	visit(node)
	return count === 1 ? yielded : undefined
}

function effectSyncReturnedExpression(checker: ts.TypeChecker | undefined, node: ts.Node) {
	if (!(checker && ts.isCallExpression(node) && isEffectCall(node) && callName(node) === 'sync')) return
	if (!(node.arguments[0] && (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))))
		return
	const expression = returnedExpression(node.arguments[0])
	if (!(expression && typeLooksEffect(checker, expression))) return
	return expression
}

function isEffectTryWithUntypedCatch(checker: ts.TypeChecker, node: ts.CallExpression) {
	if (!(isEffectCall(node) && Array.contains(['try', 'tryPromise'] as const, callName(node)))) return false
	if (!(node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0]))) return false
	const catchProperty = Array.findFirst(node.arguments[0].properties, property => {
		return ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'catch'
	})
	if (catchProperty._tag === 'None' || !ts.isPropertyAssignment(catchProperty.value)) return false
	if (
		!(ts.isArrowFunction(catchProperty.value.initializer) || ts.isFunctionExpression(catchProperty.value.initializer))
	)
		return false
	const signatures = checker.getSignaturesOfType(
		checker.getTypeAtLocation(catchProperty.value.initializer),
		ts.SignatureKind.Call
	)
	const returnType = signatures[0] ? checker.getReturnTypeOfSignature(signatures[0]) : undefined
	return returnType ? errorChannelProblem(checker, returnType) !== undefined : false
}
