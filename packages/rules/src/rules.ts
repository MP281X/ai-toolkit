import {
	calleeStaticName,
	forEachChild,
	isBlockStatement,
	isCallExpression,
	isFunctionLike,
	isIdentifier,
	isImportDeclaration,
	isImportSpecifier,
	isJSXAttribute,
	isJSXExpressionContainer,
	isMemberExpression,
	isNamespaceMemberCall,
	isNewExpression,
	isNode,
	isProperty,
	isReturnStatement,
	isTSAsExpression,
	isTSTypeAssertion,
	isTSTypeReference,
	isVariableDeclaration,
	isVariableDeclarator,
	staticMemberName,
	staticMemberObjectName,
	staticName,
	unwrapChain
} from '#lib/ast.ts'
import type {
	CallExpressionNode,
	JSXAttributeNode,
	NewExpressionNode,
	Node,
	RuleContext,
	RuleVisitors
} from '#lib/ast.ts'

export type Rule = {
	readonly create: (context: RuleContext) => RuleVisitors
	readonly id: string
	readonly severity: 'error'
	readonly title: string
}

function isTestFile(context: RuleContext) {
	return context.filename === undefined
		? false
		: /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/u.test(context.filename)
}

function isSchemaFile(context: RuleContext) {
	return context.filename === undefined ? false : /(?:^|\/)schema\.[cm]?[jt]sx?$/u.test(context.filename)
}

function report(context: RuleContext, node: Node, message: string) {
	context.report({message, node})
}

function isExportedDeclaration(node: Node) {
	return (
		node.parent?.type === 'ExportDefaultDeclaration' ||
		node.parent?.type === 'ExportNamedDeclaration' ||
		node.parent?.parent?.type === 'ExportNamedDeclaration'
	)
}

function isExportedVariableDeclarator(node: Node) {
	return node.parent?.parent?.type === 'ExportNamedDeclaration'
}

function isTopLevelVariableDeclarator(node: Node) {
	if (!isVariableDeclarator(node) || !isVariableDeclaration(node.parent)) return false
	return node.parent.parent?.type === 'Program' || node.parent.parent?.type === 'ExportNamedDeclaration'
}

function typeAnnotationNode(node: Node) {
	if (!('typeAnnotation' in node)) return
	if (isNode(node.typeAnnotation)) return node.typeAnnotation
}

function isTypePredicateReturnType(node: Node) {
	if (node.type === 'TSTypePredicate') return true
	return typeAnnotationNode(node)?.type === 'TSTypePredicate'
}

function nodeContains(node: Node, predicate: (node: Node) => boolean) {
	if (predicate(node)) return true
	const result = {found: false}
	forEachChild(node, child => {
		if (!result.found && nodeContains(child, predicate)) result.found = true
	})
	return result.found
}

function localImportName(node: Node) {
	if (!('local' in node)) return
	if (isNode(node.local) && isIdentifier(node.local)) return node.local.name
}

function isChainedIntoPrototypeCall(node: CallExpressionNode) {
	if (!isMemberExpression(node.parent) || node.parent.object !== node) return false
	if (
		!new Set([
			'every',
			'filter',
			'find',
			'findIndex',
			'flatMap',
			'includes',
			'join',
			'map',
			'match',
			'matchAll',
			'reduce',
			'replace',
			'replaceAll',
			'slice',
			'some',
			'sort',
			'split',
			'startsWith',
			'endsWith',
			'toLowerCase',
			'toSorted',
			'toUpperCase',
			'trim',
			'trimEnd',
			'trimStart'
		]).has(staticName(node.parent.property) ?? '')
	) {
		return false
	}
	return node.parent.parent?.type === 'CallExpression'
}

function isEffectSucceedCall(node: Node) {
	return isCallExpression(node) && isNamespaceMemberCall(node, 'Effect', new Set(['succeed']))
}

function isEffectFailCall(node: Node) {
	return isCallExpression(node) && isNamespaceMemberCall(node, 'Effect', new Set(['fail', 'failCause', 'failSync']))
}

export const noEffectErrorToSuccess = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (
					isNamespaceMemberCall(
						node,
						'Effect',
						new Set(['either', 'exit', 'ignore', 'ignoreCause', 'option', 'orElseSucceed', 'result'])
					)
				) {
					report(
						context,
						node,
						'Do not collapse an Effect failure into a success value. Preserve the typed error channel.'
					)
					return
				}
				if (
					!isNamespaceMemberCall(node, 'Effect', new Set(['catch', 'catchAll', 'catchIf', 'catchTag', 'catchTags']))
				) {
					return
				}
				if (nodeContains(node, isEffectFailCall) && !nodeContains(node, isEffectSucceedCall)) return
				report(
					context,
					node,
					'Do not recover Effect failures with catch*. Map service errors with Effect.mapError or let them bubble.'
				)
			}
		}
	},
	id: 'no-effect-error-to-success',
	severity: 'error',
	title: 'No Effect error erasure'
} satisfies Rule

export const noEffectRunInSource = {
	create(context) {
		if (isTestFile(context)) return {}
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (
					!isNamespaceMemberCall(
						node,
						'Effect',
						new Set([
							'runCallback',
							'runCallbackWith',
							'runFork',
							'runForkWith',
							'runPromise',
							'runPromiseExit',
							'runPromiseExitWith',
							'runPromiseWith',
							'runSync',
							'runSyncExit',
							'runSyncExitWith',
							'runSyncWith'
						])
					)
				) {
					return
				}
				report(
					context,
					node,
					'Do not execute Effect programs inside implementation code. Return Effect/Stream to the runtime boundary.'
				)
			}
		}
	},
	id: 'no-effect-run-in-source',
	severity: 'error',
	title: 'No Effect run in source'
} satisfies Rule

export const noSchemaErasingDecode = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (
					!isNamespaceMemberCall(
						node,
						'Schema',
						new Set([
							'decodeExit',
							'decodeOption',
							'decodePromise',
							'decodeResult',
							'decodeSync',
							'decodeUnknownExit',
							'decodeUnknownOption',
							'decodeUnknownPromise',
							'decodeUnknownResult',
							'decodeUnknownSync'
						])
					)
				) {
					return
				}
				report(
					context,
					node,
					'Decode through the Effect error channel. Use Schema.decodeUnknownEffect or Schema.decodeEffect.'
				)
			}
		}
	},
	id: 'no-schema-erasing-decode',
	severity: 'error',
	title: 'No schema decode erasure'
} satisfies Rule

export const noConfigOrElse = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (!isNamespaceMemberCall(node, 'Config', new Set(['orElse']))) return
				report(context, node, 'Do not use Config.orElse. Use Config.withDefault only for missing config defaults.')
			}
		}
	},
	id: 'no-config-or-else',
	severity: 'error',
	title: 'No config orElse'
} satisfies Rule

function isEffectPathServiceCall(node: CallExpressionNode) {
	return staticMemberObjectName(node.callee) === 'path' && staticMemberName(node.callee) === 'join'
}

export const noPrototypeEffectEquivalent = {
	create(context) {
		const importedNames = new Set<string>()
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (isChainedIntoPrototypeCall(node)) return
				if (!isMemberExpression(unwrapChain(node.callee))) return
				if (isEffectPathServiceCall(node)) return
				if (
					new Set([
						'Array',
						'AsyncResult',
						'Config',
						'Effect',
						'HashMap',
						'HashSet',
						'Match',
						'Option',
						'Order',
						'Record',
						'Schema',
						'Stream',
						'String',
						'Struct'
					]).has(staticMemberObjectName(node.callee) ?? '')
				) {
					return
				}
				if (importedNames.has(staticMemberObjectName(node.callee) ?? '')) return
				if (
					!new Set([
						'every',
						'filter',
						'find',
						'findIndex',
						'flatMap',
						'includes',
						'join',
						'map',
						'match',
						'matchAll',
						'reduce',
						'replace',
						'replaceAll',
						'slice',
						'some',
						'sort',
						'split',
						'startsWith',
						'endsWith',
						'toLowerCase',
						'toSorted',
						'toUpperCase',
						'trim',
						'trimEnd',
						'trimStart'
					]).has(staticMemberName(node.callee) ?? '')
				) {
					return
				}
				report(context, node, 'Use the Effect module function instead of the prototype method.')
			},
			ImportDeclaration(node: Node) {
				if (!isImportDeclaration(node) || node.specifiers === undefined) return
				for (const specifier of node.specifiers) {
					const name = localImportName(specifier)
					if (name !== undefined) importedNames.add(name)
				}
			}
		}
	},
	id: 'no-prototype-effect-equivalent',
	severity: 'error',
	title: 'No prototype Effect equivalents'
} satisfies Rule

export const noObjectDestructuring = {
	create(context) {
		return {
			ObjectPattern(node: Node) {
				report(context, node, 'Do not destructure objects. Access fields with dot notation at the use site.')
			}
		}
	},
	id: 'no-object-destructuring',
	severity: 'error',
	title: 'No object destructuring'
} satisfies Rule

function isSimpleAccessExpression(node: Node | undefined) {
	if (node === undefined) return false
	if (isTSAsExpression(node)) return isSimpleAccessExpression(node.expression)
	return isMemberExpression(unwrapChain(node))
}

export const noAccessAlias = {
	create(context) {
		return {
			VariableDeclarator(node: Node) {
				if (!isVariableDeclarator(node)) return
				if (!isIdentifier(node.id)) return
				if (isExportedVariableDeclarator(node)) return
				if (!isSimpleAccessExpression(node.init)) return
				report(context, node, 'Do not create access aliases. Inline property access at the use site.')
			}
		}
	},
	id: 'no-access-alias',
	severity: 'error',
	title: 'No access aliases'
} satisfies Rule

export const noImportRename = {
	create(context) {
		return {
			ImportDeclaration(node: Node) {
				if (!isImportDeclaration(node) || node.specifiers === undefined) return
				for (const specifier of node.specifiers) {
					if (!isImportSpecifier(specifier)) continue
					if (staticName(specifier.imported) === undefined || staticName(specifier.local) === undefined) continue
					if (staticName(specifier.imported) === staticName(specifier.local)) continue
					report(context, specifier, 'Do not rename imports. Use the exported name directly.')
				}
			}
		}
	},
	id: 'no-import-rename',
	severity: 'error',
	title: 'No import renames'
} satisfies Rule

function isAsConst(node: Node) {
	if (!isTSAsExpression(node)) return false
	if (node.typeAnnotation?.type === 'TSConstKeyword') return true
	if (!isTSTypeReference(node.typeAnnotation)) return false
	return staticName(node.typeAnnotation.typeName) === 'const'
}

export const noTypeAssertionExceptAsConst = {
	create(context) {
		return {
			TSAsExpression(node: Node) {
				if (!isTSAsExpression(node) || isAsConst(node)) return
				report(context, node, 'Do not use type assertions. Redesign the value so TypeScript can infer it.')
			},
			TSTypeAssertion(node: Node) {
				if (!isTSTypeAssertion(node)) return
				report(context, node, 'Do not use type assertions. Redesign the value so TypeScript can infer it.')
			}
		}
	},
	id: 'no-type-assertion-except-as-const',
	severity: 'error',
	title: 'No type assertions'
} satisfies Rule

export const noLocalTypeAnnotation = {
	create(context) {
		return {
			ArrowFunctionExpression(node: Node) {
				if (!isFunctionLike(node) || !isNode(node.returnType)) return
				if (isTypePredicateReturnType(node.returnType)) return
				report(context, node, 'Do not annotate local function return types. Let inference carry the type.')
			},
			FunctionDeclaration(node: Node) {
				if (!isFunctionLike(node) || !isNode(node.returnType)) return
				if (isExportedDeclaration(node) || isTypePredicateReturnType(node.returnType)) return
				report(context, node, 'Do not annotate local function return types. Let inference carry the type.')
			},
			FunctionExpression(node: Node) {
				if (!isFunctionLike(node) || !isNode(node.returnType)) return
				if (isTypePredicateReturnType(node.returnType)) return
				report(context, node, 'Do not annotate local function return types. Let inference carry the type.')
			},
			VariableDeclarator(node: Node) {
				if (!isVariableDeclarator(node)) return
				if (!('typeAnnotation' in node.id) || !isNode(node.id.typeAnnotation)) return
				report(context, node, 'Do not annotate local variables. Let inference carry the type.')
			}
		}
	},
	id: 'no-local-type-annotation',
	severity: 'error',
	title: 'No local type annotations'
} satisfies Rule

function functionReturnExpression(node: Node) {
	if (!isFunctionLike(node) || !isNode(node.body)) return
	if (!isBlockStatement(node.body)) return node.body
	if (node.body.body?.length !== 1) return
	const [statement] = node.body.body
	if (!isReturnStatement(statement) || !isNode(statement.argument)) return
	return statement.argument
}

function forwardsAllParameters(expression: CallExpressionNode | NewExpressionNode, node: Node) {
	if (!isFunctionLike(node) || node.params === undefined) return false
	if (node.params.length === 0 || expression.arguments?.length !== node.params.length) return false
	const argumentIterator = expression.arguments[Symbol.iterator]()
	for (const parameter of node.params) {
		const argument = argumentIterator.next()
		if (
			argument.done === true ||
			!isIdentifier(argument.value) ||
			!isIdentifier(parameter) ||
			argument.value.name !== parameter.name
		) {
			return false
		}
	}
	return true
}

function isRegExpTestAdapter(expression: CallExpressionNode | NewExpressionNode) {
	return isCallExpression(expression) && staticMemberName(expression.callee) === 'test'
}

export const noSignatureWrapper = {
	create(context) {
		function check(node: Node) {
			const expression = functionReturnExpression(node)
			if (expression === undefined) return
			if (!isCallExpression(expression) && !isNewExpression(expression)) return
			if (node.parent?.type === 'MethodDefinition') return
			if (isRegExpTestAdapter(expression)) return
			if (!forwardsAllParameters(expression, node)) return
			report(context, node, 'Do not wrap a function just to change its signature. Inline the call.')
		}
		return {ArrowFunctionExpression: check, FunctionDeclaration: check, FunctionExpression: check}
	},
	id: 'no-signature-wrapper',
	severity: 'error',
	title: 'No signature wrappers'
} satisfies Rule

export const noClassNameVariable = {
	create(context) {
		return {
			VariableDeclarator(node: Node) {
				if (!isVariableDeclarator(node) || !isIdentifier(node.id)) return
				if (node.id.name !== 'className' && node.id.name !== 'classNames' && !/ClassName$/u.test(node.id.name)) return
				report(context, node, 'Do not extract className values. Inline className and use cn for conditional classes.')
			}
		}
	},
	id: 'no-classname-variable',
	severity: 'error',
	title: 'No className variables'
} satisfies Rule

function isObjectExpression(node: Node | undefined) {
	return node?.type === 'ObjectExpression'
}

function nodeKey(node: Node) {
	if (!('key' in node)) return
	if (isNode(node.key)) return node.key
}

function collectObjectVariableNames(node: Node, names: Set<string>) {
	if (isVariableDeclarator(node) && isIdentifier(node.id) && isObjectExpression(node.init)) names.add(node.id.name)
	forEachChild(node, child => {
		collectObjectVariableNames(child, names)
	})
}

function reportForwardedObjectArguments(
	context: RuleContext,
	node: CallExpressionNode | NewExpressionNode,
	names: Set<string>
) {
	if (node.arguments === undefined) return
	for (const argument of node.arguments) {
		if (!isIdentifier(argument) || !names.has(argument.name)) continue
		report(context, argument, 'Inline object literals at the call site instead of forwarding config/input variables.')
	}
}

export const preferInlineCallInput = {
	create(context) {
		const objectVariables = new Set<string>()
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				reportForwardedObjectArguments(context, node, objectVariables)
			},
			NewExpression(node: Node) {
				if (!isNewExpression(node)) return
				reportForwardedObjectArguments(context, node, objectVariables)
			},
			Program(node: Node) {
				collectObjectVariableNames(node, objectVariables)
			}
		}
	},
	id: 'prefer-inline-call-input',
	severity: 'error',
	title: 'Prefer inline call input'
} satisfies Rule

function isUseAtomSetCall(node: CallExpressionNode) {
	return calleeStaticName(node) === 'useAtomSet'
}

export const preferUseAtomTuple = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node) || !isUseAtomSetCall(node)) return
				report(context, node, 'Use const [state, send] = useAtom(atom) instead of useAtomSet.')
			}
		}
	},
	id: 'prefer-use-atom-tuple',
	severity: 'error',
	title: 'Prefer useAtom tuple'
} satisfies Rule

function jsxAttributeName(node: JSXAttributeNode) {
	return staticName(node.name)
}

function jsxAttributeExpression(node: JSXAttributeNode) {
	return isJSXExpressionContainer(node.value) ? node.value.expression : node.value
}

export const noClassNameIndirection = {
	create(context) {
		return {
			JSXAttribute(node: Node) {
				if (!isJSXAttribute(node) || jsxAttributeName(node) !== 'className') return
				if (!isIdentifier(jsxAttributeExpression(node))) return
				report(context, node, 'Inline className expressions instead of passing a className variable.')
			}
		}
	},
	id: 'no-classname-indirection',
	severity: 'error',
	title: 'No className indirection'
} satisfies Rule

export const noTwoArgumentPipe = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				const callee = unwrapChain(node.callee)
				if (!isIdentifier(callee) || staticName(callee) !== 'pipe') return
				if (node.arguments?.length !== 2) return
				report(context, node, 'Do not use pipe with only one transformation. Call the Effect module function directly.')
			}
		}
	},
	id: 'no-two-argument-pipe',
	severity: 'error',
	title: 'No two argument pipe'
} satisfies Rule

export const noPromiseCatchFinally = {
	create(context) {
		if (isTestFile(context)) return {}
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (!isMemberExpression(unwrapChain(node.callee))) return
				if (!new Set(['catch', 'finally']).has(staticMemberName(node.callee) ?? '')) return
				report(
					context,
					node,
					'Do not use Promise .catch() or .finally(). Use async functions with explicit control flow.'
				)
			}
		}
	},
	id: 'no-promise-catch-finally',
	severity: 'error',
	title: 'No promise catch or finally'
} satisfies Rule

export const noDirectTagField = {
	create(context) {
		if (isTestFile(context) || isSchemaFile(context)) return {}
		return {
			MemberExpression(node: Node) {
				if (!isMemberExpression(node) || staticMemberName(node) !== '_tag') return
				report(context, node, 'Do not access _tag directly. Use Match.tag, AsyncResult helpers, or domain helpers.')
			},
			Property(node: Node) {
				if (!isProperty(node) || node.parent?.type !== 'ObjectExpression') return
				if (staticName(nodeKey(node)) !== '_tag') return
				report(context, node, 'Do not construct _tag objects directly. Use schema or domain constructors.')
			},
			TSPropertySignature(node: Node) {
				if (staticName(nodeKey(node)) !== '_tag') return
				report(context, node, 'Do not define _tag implementation types directly. Use exported schema/domain types.')
			}
		}
	},
	id: 'no-direct-tag-field',
	severity: 'error',
	title: 'No direct tag field'
} satisfies Rule

export const noLet = {
	create(context) {
		return {
			VariableDeclaration(node: Node) {
				if (!('kind' in node) || node.kind !== 'let') return
				report(context, node, 'Do not use let. Use const with direct expressions, Match, early returns, or reducers.')
			}
		}
	},
	id: 'no-let',
	severity: 'error',
	title: 'No let'
} satisfies Rule

function isSchemaStructCall(node: Node | undefined) {
	return isCallExpression(node) && isNamespaceMemberCall(node, 'Schema', new Set(['Struct']))
}

export const noTopLevelSchemaStruct = {
	create(context) {
		return {
			VariableDeclarator(node: Node) {
				if (!isVariableDeclarator(node)) return
				if (!isTopLevelVariableDeclarator(node)) return
				if (!isSchemaStructCall(node.init)) return
				report(
					context,
					node,
					'Do not define top-level Schema.Struct schemas. Boundary schemas need constructors and equality; use Schema.Class or Schema.TaggedClass, for example class User extends Schema.Class<User>("User")({id: Schema.String}) {}.'
				)
			}
		}
	},
	id: 'no-top-level-schema-struct',
	severity: 'error',
	title: 'No top-level Schema.Struct'
} satisfies Rule

function isTopLevelConstantDataExpression(node: Node | undefined) {
	if (node === undefined) return false
	if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression' || node.type === 'TemplateLiteral') {
		return true
	}
	if (node.type === 'Literal') return true
	if (!isNewExpression(node)) return false
	const name = staticName(node.callee)
	return name === 'Map' || name === 'RegExp' || name === 'Set' || name === 'WeakMap' || name === 'WeakSet'
}

export const noTopLevelConstantData = {
	create(context) {
		return {
			VariableDeclarator(node: Node) {
				if (!isVariableDeclarator(node)) return
				if (!isTopLevelVariableDeclarator(node)) return
				if (isExportedVariableDeclarator(node)) return
				if (!isTopLevelConstantDataExpression(node.init)) return
				report(
					context,
					node,
					'Do not store top-level literal/config data in a const. It hides simple values away from the only workflow that uses them; inline the array, object, regex, or set at the use site.'
				)
			}
		}
	},
	id: 'no-top-level-constant-data',
	severity: 'error',
	title: 'No top-level constant data'
} satisfies Rule

export const noLocalTypeAlias = {
	create(context) {
		return {
			TSTypeAliasDeclaration(node: Node) {
				if (isExportedDeclaration(node)) return
				report(
					context,
					node,
					'Do not define local type aliases. They add review indirection and weaken inference; inline the shape where it is needed or expose a schema-backed domain type.'
				)
			}
		}
	},
	id: 'no-local-type-alias',
	severity: 'error',
	title: 'No local type aliases'
} satisfies Rule

function isLayerMockMember(node: Node) {
	return staticMemberName(node) === 'layerMock'
}

export const noLayerMock = {
	create(context) {
		if (isTestFile(context)) return {}
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node) || !isLayerMockMember(node.callee)) return
				report(
					context,
					node,
					'Do not use service layerMock APIs in implementation code. Mock layers become production surface area; test behavior with the real layer or a test-local layer.'
				)
			},
			MethodDefinition(node: Node) {
				if (staticName(nodeKey(node)) !== 'layerMock') return
				report(
					context,
					node,
					'Do not expose layerMock on services. Mock layers become production surface area; keep test doubles test-local.'
				)
			},
			Property(node: Node) {
				if (!isProperty(node) || staticName(nodeKey(node)) !== 'layerMock') return
				report(
					context,
					node,
					'Do not expose layerMock on services. Mock layers become production surface area; keep test doubles test-local.'
				)
			},
			PropertyDefinition(node: Node) {
				if (staticName(nodeKey(node)) !== 'layerMock') return
				report(
					context,
					node,
					'Do not expose layerMock on services. Mock layers become production surface area; keep test doubles test-local.'
				)
			}
		}
	},
	id: 'no-layer-mock',
	severity: 'error',
	title: 'No service layer mocks'
} satisfies Rule

export const noOptimisticAtom = {
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isCallExpression(node)) return
				if (!isNamespaceMemberCall(node, 'Atom', new Set(['optimistic', 'optimisticFn']))) return
				report(
					context,
					node,
					'Do not use optimistic atoms for backend mutations. They duplicate state and hide failures; show loading/error on the action and let the typed failure surface.'
				)
			}
		}
	},
	id: 'no-optimistic-atom',
	severity: 'error',
	title: 'No optimistic atoms'
} satisfies Rule

export const rules = {
	'no-access-alias': noAccessAlias,
	'no-classname-indirection': noClassNameIndirection,
	'no-classname-variable': noClassNameVariable,
	'no-config-or-else': noConfigOrElse,
	'no-direct-tag-field': noDirectTagField,
	'no-effect-error-to-success': noEffectErrorToSuccess,
	'no-effect-run-in-source': noEffectRunInSource,
	'no-import-rename': noImportRename,
	'no-layer-mock': noLayerMock,
	'no-let': noLet,
	'no-local-type-alias': noLocalTypeAlias,
	'no-local-type-annotation': noLocalTypeAnnotation,
	'no-object-destructuring': noObjectDestructuring,
	'no-optimistic-atom': noOptimisticAtom,
	'no-promise-catch-finally': noPromiseCatchFinally,
	'no-prototype-effect-equivalent': noPrototypeEffectEquivalent,
	'no-schema-erasing-decode': noSchemaErasingDecode,
	'no-signature-wrapper': noSignatureWrapper,
	'no-top-level-constant-data': noTopLevelConstantData,
	'no-top-level-schema-struct': noTopLevelSchemaStruct,
	'no-two-argument-pipe': noTwoArgumentPipe,
	'no-type-assertion-except-as-const': noTypeAssertionExceptAsConst,
	'prefer-inline-call-input': preferInlineCallInput,
	'prefer-use-atom-tuple': preferUseAtomTuple
}

// eslint-disable-next-line import/no-default-export -- oxlint JavaScript plugins are loaded from the default export.
export default {meta: {name: 'deslop'}, rules}
