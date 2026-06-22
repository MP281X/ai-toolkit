import {Array, Predicate, String, pipe} from 'effect'

import {definePlugin} from '@oxlint/plugins'
import type {Context, ESTree} from '@oxlint/plugins'

const sourceReferenceCount = (
	context: Context,
	node: {
		readonly body?: {readonly end: number; readonly start: number} | null
		readonly id?: {readonly name: string} | null
	}
) =>
	Predicate.isNotNullish(node.id) && Predicate.isNotNullish(node.body)
		? [
				...pipe(context.sourceCode.text, String.slice(node.body.start, node.body.end)).matchAll(
					new RegExp(`\\b${node.id.name}\\s*\\(`, 'gu')
				)
			].length
		: 0

const isEffectMemberCall = (node: ESTree.Expression, name: string) =>
	node.type === 'CallExpression' &&
	node.callee.type === 'MemberExpression' &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Effect' &&
	node.callee.property.type === 'Identifier' &&
	node.callee.property.name === name

const isEffectGenCall = (node: ESTree.Expression) => isEffectMemberCall(node, 'gen')

function isUndefinedType(node: ESTree.TSType): boolean {
	return (
		node.type === 'TSUndefinedKeyword' ||
		(node.type === 'TSUnionType' && Array.some(node.types, typeNode => isUndefinedType(typeNode)))
	)
}

const isCallArgument = (node: {readonly parent: {readonly type: string}}) =>
	node.parent.type === 'CallExpression' ||
	node.parent.type === 'NewExpression' ||
	node.parent.type === 'ArrayExpression' ||
	node.parent.type === 'JSXExpressionContainer'

const isAtomFamilyCallback = (node: ESTree.ArrowFunctionExpression | ESTree.Function) =>
	node.parent.type === 'CallExpression' &&
	node.parent.callee.type === 'MemberExpression' &&
	node.parent.callee.object.type === 'Identifier' &&
	node.parent.callee.object.name === 'Atom' &&
	node.parent.callee.property.type === 'Identifier' &&
	node.parent.callee.property.name === 'family'

const isNamedFunctionRecursive = (context: Context, node: ESTree.Function) =>
	node.type === 'FunctionDeclaration' && Predicate.isNotNull(node.id) && sourceReferenceCount(context, node) > 0

const isBoundaryTypeName = (name: string) =>
	/(?:Schema|Contract|Request|Response|Error|Props|State|Event|Command|Config|Id|Options|Params|Result|Payload|Handle)$/u.test(
		name
	)

const isPublicHandleName = (name: string) => /Handle$/u.test(name)

const isSchemaTypeAlias = (node: ESTree.TSTypeAliasDeclaration) =>
	node.typeAnnotation.type === 'TSTypeQuery' &&
	node.typeAnnotation.exprName.type === 'TSQualifiedName' &&
	node.typeAnnotation.exprName.left.type === 'Identifier' &&
	node.typeAnnotation.exprName.left.name === node.id.name &&
	node.typeAnnotation.exprName.right.name === 'Type'

const isUppercaseName = (name: string) => /^[A-Z]/u.test(name)

const isHookName = (name: string) => /^use[A-Z]/u.test(name)

const isRecursiveFunction = (context: Context, node: ESTree.Function) =>
	Predicate.isNotNull(node.id) && sourceReferenceCount(context, node) > 0

const isSimpleSingleUseFunction = (node: ESTree.Function) =>
	Predicate.isNotNull(node.body) &&
	node.body.body.length === 1 &&
	node.body.body[0]?.type === 'ReturnStatement' &&
	Predicate.isNotNull(node.body.body[0].argument) &&
	(node.body.body[0].argument.type === 'Identifier' ||
		node.body.body[0].argument.type === 'MemberExpression' ||
		node.body.body[0].argument.type === 'Literal')

const isNullishLiteral = (node: ESTree.Expression) =>
	(node.type === 'Literal' && Predicate.isNull(node.value)) ||
	(node.type === 'Identifier' && node.name === 'undefined') ||
	(node.type === 'UnaryExpression' && node.operator === 'void')

const reportsNullishComparison = (node: ESTree.BinaryExpression) =>
	(node.operator === '===' || node.operator === '!==' || node.operator === '==' || node.operator === '!=') &&
	(isNullishLiteral(node.left) || isNullishLiteral(node.right))

const reportsTypeofComparison = (node: ESTree.BinaryExpression) =>
	(node.operator === '===' || node.operator === '!==' || node.operator === '==' || node.operator === '!=') &&
	((node.left.type === 'UnaryExpression' && node.left.operator === 'typeof' && node.right.type === 'Literal') ||
		(node.right.type === 'UnaryExpression' && node.right.operator === 'typeof' && node.left.type === 'Literal'))

const conditionAliasBinaryOperators = ['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'in', 'instanceof'] as const

const reportsConditionAlias = (node: ESTree.Expression) =>
	(node.type === 'BinaryExpression' && Array.contains(conditionAliasBinaryOperators, node.operator)) ||
	(node.type === 'LogicalExpression' && node.operator !== '??') ||
	(node.type === 'UnaryExpression' && node.operator === '!')

const optionConstructors = [
	'fromIterable',
	'fromNullable',
	'fromPredicate',
	'liftNullable',
	'liftPredicate',
	'none',
	'some',
	'try'
] as const

const nativeMutableCollections = ['Map', 'Set', 'WeakMap', 'WeakSet'] as const

const nativePrototypeMethods = [
	'at',
	'concat',
	'endsWith',
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flat',
	'flatMap',
	'includes',
	'join',
	'map',
	'reduce',
	'reduceRight',
	'replace',
	'replaceAll',
	'slice',
	'some',
	'split',
	'startsWith',
	'toLowerCase',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart'
] as const

const isIdentifierMemberCall = (node: ESTree.CallExpression, name: string, objectName?: string) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.property.type === 'Identifier' &&
	node.callee.property.name === name &&
	(Predicate.isUndefined(objectName) ||
		(node.callee.object.type === 'Identifier' && node.callee.object.name === objectName))

const isOptionConstructorCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Option' &&
	node.callee.property.type === 'Identifier' &&
	Array.contains(optionConstructors, node.callee.property.name)

const isPromiseCallbackCall = (node: ESTree.CallExpression) =>
	(isIdentifierMemberCall(node, 'then') ||
		isIdentifierMemberCall(node, 'catch') ||
		isIdentifierMemberCall(node, 'finally')) &&
	Array.some(
		node.arguments,
		argument => argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression'
	) &&
	!(
		node.callee.type === 'MemberExpression' &&
		node.callee.object.type === 'Identifier' &&
		/^[A-Z]/u.test(node.callee.object.name)
	)

const isNativeMutableCollection = (node: ESTree.NewExpression) =>
	node.callee.type === 'Identifier' && Array.contains(nativeMutableCollections, node.callee.name)

const isNativePrototypeMethodCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.object.type !== 'Identifier' &&
	node.callee.property.type === 'Identifier' &&
	Array.contains(nativePrototypeMethods, node.callee.property.name)

const isZeroArgEffectGenWrapperBody = (node: ESTree.Expression | ESTree.FunctionBody | null) =>
	Predicate.isNotNull(node) &&
	(node.type === 'BlockStatement'
		? node.body.length === 1 &&
			node.body[0]?.type === 'ReturnStatement' &&
			Predicate.isNotNull(node.body[0].argument) &&
			isEffectGenCall(node.body[0].argument)
		: isEffectGenCall(node))

const hasParameterTypeAnnotation = (parameter: ESTree.ParamPattern) =>
	Predicate.hasProperty(parameter, 'typeAnnotation') && Predicate.isNotNullish(parameter.typeAnnotation)

const isDirectEffectCall = (node: ESTree.Expression) =>
	node.type === 'CallExpression' &&
	node.callee.type === 'MemberExpression' &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Effect' &&
	node.callee.property.type === 'Identifier' &&
	!String.startsWith('run')(node.callee.property.name)

const isEffectReturningBody = (node: ESTree.Expression | ESTree.FunctionBody | null) =>
	Predicate.isNotNull(node) &&
	(node.type === 'BlockStatement'
		? node.body.length === 1 &&
			node.body[0]?.type === 'ReturnStatement' &&
			Predicate.isNotNull(node.body[0].argument) &&
			isDirectEffectCall(node.body[0].argument)
		: isDirectEffectCall(node))

const isSingleYieldFunction = (node: ESTree.Expression | ESTree.SpreadElement | null | undefined) =>
	(node?.type === 'FunctionExpression' || node?.type === 'ArrowFunctionExpression') &&
	Predicate.isNotNull(node.body) &&
	node.body.type === 'BlockStatement' &&
	node.body.body.length === 1 &&
	node.body.body[0]?.type === 'ExpressionStatement' &&
	node.body.body[0].expression.type === 'YieldExpression'

const isSingleYieldEffectGen = (node: ESTree.CallExpression) =>
	isEffectGenCall(node) && isSingleYieldFunction(node.arguments[0])

const isNamedEffectFnCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'CallExpression' &&
	node.callee.callee.type === 'MemberExpression' &&
	node.callee.callee.object.type === 'Identifier' &&
	node.callee.callee.object.name === 'Effect' &&
	node.callee.callee.property.type === 'Identifier' &&
	node.callee.callee.property.name === 'fn'

const isUselessEffectWrapper = (node: ESTree.CallExpression) =>
	(isNamedEffectFnCall(node) && isSingleYieldFunction(node.arguments[0])) || isSingleYieldEffectGen(node)

const isTrivialHandlerFunction = (context: Context, node: ESTree.Function) =>
	node.type === 'FunctionDeclaration' &&
	Predicate.isNotNull(node.id) &&
	Predicate.isNotNull(node.body) &&
	[...context.sourceCode.text.matchAll(new RegExp(`\\b${node.id.name}\\b`, 'gu'))].length <= 2 &&
	node.body.body.length <= 2 &&
	Array.some(node.body.body, statement => statement.type === 'ExpressionStatement')

const isAccessExpression = (node: ESTree.Expression) =>
	node.type === 'MemberExpression' || (node.type === 'ChainExpression' && node.expression.type === 'MemberExpression')

const isAccessHelperBody = (node: ESTree.FunctionBody | null) =>
	Predicate.isNotNull(node) &&
	node.body.length === 1 &&
	node.body[0]?.type === 'ReturnStatement' &&
	Predicate.isNotNull(node.body[0].argument) &&
	(isAccessExpression(node.body[0].argument) ||
		(node.body[0].argument.type === 'LogicalExpression' &&
			node.body[0].argument.operator === '??' &&
			isAccessExpression(node.body[0].argument.left)))

const isIifeCallee = (node: ESTree.Expression) =>
	node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'

const isMatchPatternObject = (node: ESTree.ObjectExpression) =>
	node.parent.type === 'CallExpression' &&
	node.parent.callee.type === 'MemberExpression' &&
	node.parent.callee.object.type === 'Identifier' &&
	node.parent.callee.object.name === 'Match'

const isSchemaStructObject = (node: ESTree.ObjectExpression) =>
	node.parent.type === 'CallExpression' &&
	node.parent.callee.type === 'MemberExpression' &&
	node.parent.callee.object.type === 'Identifier' &&
	node.parent.callee.object.name === 'Schema' &&
	node.parent.callee.property.type === 'Identifier' &&
	(node.parent.callee.property.name === 'Struct' ||
		node.parent.callee.property.name === 'TaggedClass' ||
		node.parent.callee.property.name === 'TaggedErrorClass')

const hasRawTagProperty = (node: ESTree.ObjectExpression) =>
	Array.some(
		node.properties,
		property =>
			property.type === 'Property' &&
			!property.computed &&
			((property.key.type === 'Identifier' && property.key.name === '_tag') ||
				(property.key.type === 'Literal' && property.key.value === '_tag')) &&
			property.value.type === 'Literal' &&
			Predicate.isString(property.value.value)
	)

const isMutableModuleStateInit = (node: ESTree.Expression) =>
	node.type === 'ObjectExpression' ||
	(node.type === 'NewExpression' &&
		node.callee.type === 'Identifier' &&
		(node.callee.name === 'Map' ||
			node.callee.name === 'Set' ||
			node.callee.name === 'WeakMap' ||
			node.callee.name === 'WeakSet'))

const isMutatedModuleState = (context: Context, name: string) =>
	new RegExp(`\\b${name}\\.[A-Za-z_$][\\w$]*\\s*=|\\b${name}\\.(?:add|clear|delete|set)\\s*\\(`, 'u').test(
		context.sourceCode.text
	)

const comparedExpressionSource = (context: Context, node: ESTree.Expression) =>
	node.type === 'BinaryExpression' &&
	(node.operator === '===' || node.operator === '!==') &&
	node.right.type === 'Literal'
		? pipe(context.sourceCode.text, String.slice(node.left.start, node.left.end))
		: undefined

const hasSameDiscriminantElseIf = (context: Context, node: ESTree.IfStatement) => {
	const source = comparedExpressionSource(context, node.test)
	return (
		Predicate.isNotUndefined(source) &&
		node.alternate?.type === 'IfStatement' &&
		comparedExpressionSource(context, node.alternate.test) === source
	)
}

const hasSameDiscriminantNextIf = (context: Context, left: ESTree.Statement, right: ESTree.Statement | undefined) =>
	left.type === 'IfStatement' &&
	right?.type === 'IfStatement' &&
	Predicate.isNotUndefined(comparedExpressionSource(context, left.test)) &&
	comparedExpressionSource(context, left.test) === comparedExpressionSource(context, right.test)

const isModuleAugmentationExport = (node: ESTree.ExportNamedDeclaration) =>
	node.parent.type === 'TSModuleBlock' &&
	Predicate.hasProperty(node.parent.parent, 'id') &&
	Predicate.hasProperty(node.parent.parent.id, 'type') &&
	node.parent.parent.id.type === 'Literal'

export default definePlugin({
	meta: {name: '@deslop/oxlint-rules'},
	rules: {
		'no-access-alias': {
			create: context => ({
				VariableDeclarator: node => {
					if (
						node.id.type === 'Identifier' &&
						Predicate.isNotNull(node.init) &&
						((node.init.type === 'MemberExpression' && !node.init.computed) ||
							(node.init.type === 'ChainExpression' &&
								node.init.expression.type === 'MemberExpression' &&
								!node.init.expression.computed))
					) {
						context.report({message: 'Inline access alias.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline access alias.'}, type: 'problem'}
		},
		'no-access-helper': {
			create: context => ({
				FunctionDeclaration: node => {
					if (isAccessHelperBody(node.body)) {
						context.report({message: 'Inline access helper.', node})
					}
				},
				FunctionExpression: node => {
					if (isAccessHelperBody(node.body)) {
						context.report({message: 'Inline access helper.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline access helper.'}, type: 'problem'}
		},
		'no-atom-family-inferred-arg': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (isAtomFamilyCallback(node)) {
						for (const parameter of node.params) {
							if (!hasParameterTypeAnnotation(parameter)) {
								context.report({message: 'Type Atom.family argument.', node: parameter})
							}
						}
					}
				},
				FunctionExpression: node => {
					if (isAtomFamilyCallback(node)) {
						for (const parameter of node.params) {
							if (!hasParameterTypeAnnotation(parameter)) {
								context.report({message: 'Type Atom.family argument.', node: parameter})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Type Atom.family argument.'}, type: 'problem'}
		},
		'no-composed-identity-key': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (node.declaration?.type === 'VariableDeclaration') {
						for (const declaration of node.declaration.declarations) {
							if (declaration.init?.type === 'TemplateLiteral' || declaration.init?.type === 'BinaryExpression') {
								context.report({message: 'Use structured identity.', node: declaration})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Use structured identity.'}, type: 'problem'}
		},
		'no-condition-alias': {
			create: context => ({
				VariableDeclarator: node => {
					if (node.id.type === 'Identifier' && Predicate.isNotNull(node.init) && reportsConditionAlias(node.init)) {
						context.report({message: 'Inline condition alias.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline condition alias.'}, type: 'problem'}
		},
		'no-declare-module-export': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (isModuleAugmentationExport(node)) {
						context.report({message: 'Do not export inside module augmentation.', node})
					}
				}
			}),
			meta: {messages: {default: 'Do not export inside module augmentation.'}, type: 'problem'}
		},
		'no-effect-returning-function': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (
						!isCallArgument(node) &&
						!isAtomFamilyCallback(node) &&
						Predicate.isNotNull(node.parent) &&
						node.params.length > 0 &&
						isEffectReturningBody(node.body)
					) {
						context.report({message: 'Use Effect.fn for functions returning Effect.', node})
					}
				},
				FunctionDeclaration: node => {
					if (node.params.length > 0 && isEffectReturningBody(node.body)) {
						context.report({message: 'Use Effect.fn for functions returning Effect.', node})
					}
				},
				FunctionExpression: node => {
					if (!isCallArgument(node) && node.params.length > 0 && isEffectReturningBody(node.body)) {
						context.report({message: 'Use Effect.fn for functions returning Effect.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect.fn for functions returning Effect.'}, type: 'problem'}
		},
		'no-exported-local-type': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (
						(node.declaration?.type === 'TSInterfaceDeclaration' ||
							node.declaration?.type === 'TSTypeAliasDeclaration') &&
						node.parent.type !== 'TSModuleBlock' &&
						(node.declaration.type !== 'TSTypeAliasDeclaration' || !isSchemaTypeAlias(node.declaration)) &&
						!isPublicHandleName(node.declaration.id.name) &&
						!isBoundaryTypeName(node.declaration.id.name)
					) {
						context.report({message: 'Do not export local implementation types.', node: node.declaration})
					}
				}
			}),
			meta: {messages: {default: 'Do not export local implementation types.'}, type: 'problem'}
		},
		'no-floating-local-type': {
			createOnce: context => ({
				Program: node => {
					for (const statement of node.body) {
						if (
							(statement.type === 'TSInterfaceDeclaration' || statement.type === 'TSTypeAliasDeclaration') &&
							(statement.type !== 'TSTypeAliasDeclaration' || !isSchemaTypeAlias(statement)) &&
							!isBoundaryTypeName(statement.id.name)
						) {
							context.report({message: 'Inline type.', node: statement})
						}
					}
				}
			}),
			meta: {messages: {default: 'Inline type.'}, type: 'problem'}
		},
		'no-function-return-type': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (Predicate.isNotNullish(node.returnType)) {
						context.report({message: 'Infer function return type.', node})
					}
				},
				FunctionDeclaration: node => {
					if (Predicate.isNotNullish(node.returnType) && !isNamedFunctionRecursive(context, node)) {
						context.report({message: 'Infer function return type.', node})
					}
				},
				FunctionExpression: node => {
					if (Predicate.isNotNullish(node.returnType)) {
						context.report({message: 'Infer function return type.', node})
					}
				},
				MethodDefinition: node => {
					if (Predicate.isNotNullish(node.value.returnType)) {
						context.report({message: 'Infer function return type.', node})
					}
				}
			}),
			meta: {messages: {default: 'Infer function return type.'}, type: 'problem'}
		},
		'no-identity-callback': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (
						isCallArgument(node) &&
						node.params[0]?.type === 'Identifier' &&
						node.params.length === 1 &&
						node.body.type === 'Identifier' &&
						node.body.name === node.params[0].name
					) {
						context.report({message: 'Use Function.identity.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Function.identity.'}, type: 'problem'}
		},
		'no-iife': {
			create: context => ({
				CallExpression: node => {
					if (isIifeCallee(node.callee)) {
						context.report({message: 'Do not use IIFEs.', node})
					}
				}
			}),
			meta: {messages: {default: 'Do not use IIFEs.'}, type: 'problem'}
		},
		'no-import-alias': {
			create: context => ({
				ImportSpecifier: node => {
					if (node.imported.type === 'Identifier' && node.imported.name !== node.local.name) {
						context.report({message: 'Do not alias named imports.', node})
					}
				}
			}),
			meta: {messages: {default: 'Do not alias named imports.'}, type: 'problem'}
		},
		'no-let': {
			create: context => ({
				VariableDeclaration: node => {
					if (node.kind === 'let') {
						context.report({message: 'Use expressions instead of let.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use expressions instead of let.'}, type: 'problem'}
		},
		'no-module-mutable-state': {
			createOnce: context => ({
				Program: node => {
					for (const statement of node.body) {
						if (statement.type !== 'VariableDeclaration') continue
						for (const declaration of statement.declarations) {
							if (
								declaration.id.type === 'Identifier' &&
								Predicate.isNotNull(declaration.init) &&
								isMutableModuleStateInit(declaration.init) &&
								isMutatedModuleState(context, declaration.id.name)
							) {
								context.report({message: 'Do not keep mutable module state.', node: declaration})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Do not keep mutable module state.'}, type: 'problem'}
		},
		'no-native-mutable-collection': {
			create: context => ({
				NewExpression: node => {
					if (isNativeMutableCollection(node)) {
						context.report({message: 'Use Effect data structures or domain state.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect data structures or domain state.'}, type: 'problem'}
		},
		'no-native-prototype-method': {
			create: context => ({
				CallExpression: node => {
					if (isNativePrototypeMethodCall(node)) {
						context.report({message: 'Use Effect module functions.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect module functions.'}, type: 'problem'}
		},
		'no-nullary-effect-fn': {
			create: context => ({
				CallExpression: node => {
					if (
						node.callee.type === 'CallExpression' &&
						node.callee.callee.type === 'MemberExpression' &&
						node.callee.callee.object.type === 'Identifier' &&
						node.callee.callee.object.name === 'Effect' &&
						node.callee.callee.property.type === 'Identifier' &&
						node.callee.callee.property.name === 'fn' &&
						(node.arguments[0]?.type === 'FunctionExpression' ||
							node.arguments[0]?.type === 'ArrowFunctionExpression') &&
						node.arguments[0].params.length === 0
					) {
						context.report({message: 'Nullary Effect.fn; use Effect.gen.', node})
					}
				}
			}),
			meta: {messages: {default: 'Nullary Effect.fn; use Effect.gen.'}, type: 'problem'}
		},
		'no-nullary-effect-wrapper': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (node.params.length === 0 && isZeroArgEffectGenWrapperBody(node.body)) {
						context.report({message: 'Use an Effect.gen value for nullary work.', node})
					}
				},
				FunctionDeclaration: node => {
					if (node.params.length === 0 && isZeroArgEffectGenWrapperBody(node.body)) {
						context.report({message: 'Use an Effect.gen value for nullary work.', node})
					}
				},
				FunctionExpression: node => {
					if (node.params.length === 0 && isZeroArgEffectGenWrapperBody(node.body)) {
						context.report({message: 'Use an Effect.gen value for nullary work.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use an Effect.gen value for nullary work.'}, type: 'problem'}
		},
		'no-nullish-comparison': {
			create: context => ({
				BinaryExpression: node => {
					if (reportsNullishComparison(node) || reportsTypeofComparison(node)) {
						context.report({message: 'Use Predicate for nullish checks.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Predicate for nullish checks.'}, type: 'problem'}
		},
		'no-object-destructure': {
			create: context => ({
				ObjectPattern: node => {
					context.report({message: 'No object destructure; use property access.', node})
				}
			}),
			meta: {messages: {default: 'No object destructure; use property access.'}, type: 'problem'}
		},
		'no-option-constructor': {
			create: context => ({
				CallExpression: node => {
					if (isOptionConstructorCall(node)) {
						context.report({message: 'Consume existing Options; do not construct local Options.', node})
					}
				}
			}),
			meta: {messages: {default: 'Consume existing Options; do not construct local Options.'}, type: 'problem'}
		},
		'no-optional-undefined-property': {
			create: context => ({
				TSPropertySignature: node => {
					if (
						node.optional === true &&
						Predicate.isNotNullish(node.typeAnnotation) &&
						isUndefinedType(node.typeAnnotation.typeAnnotation)
					) {
						context.report({message: 'Inline type.', node})
					}
				}
			}),
			meta: {messages: {default: 'Do not add undefined to optional properties.'}, type: 'problem'}
		},
		'no-pass-through-wrapper': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (
						(node.params[0]?.type === 'Identifier' &&
							node.params.length === 1 &&
							node.body.type === 'Identifier' &&
							node.body.name === node.params[0].name) ||
						(node.params[0]?.type === 'Identifier' &&
							node.params.length === 1 &&
							node.body.type === 'BlockStatement' &&
							node.body.body.length === 1 &&
							node.body.body[0]?.type === 'ReturnStatement' &&
							node.body.body[0].argument?.type === 'Identifier' &&
							node.body.body[0].argument.name === node.params[0].name)
					) {
						context.report({message: 'Inline wrapper.', node})
					}
				},
				FunctionDeclaration: node => {
					if (
						node.params[0]?.type === 'Identifier' &&
						node.params.length === 1 &&
						node.body?.body.length === 1 &&
						node.body.body[0]?.type === 'ReturnStatement' &&
						node.body.body[0].argument?.type === 'Identifier' &&
						node.body.body[0].argument.name === node.params[0].name
					) {
						context.report({message: 'Inline wrapper.', node})
					}
					if (isTrivialHandlerFunction(context, node)) {
						context.report({message: 'Inline wrapper.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline wrapper.'}, type: 'problem'}
		},
		'no-private-test-import': {
			create: context => ({
				ImportDeclaration: node => {
					if (
						/\.test\.[cm]?[jt]sx?$/.test(context.filename) &&
						(String.startsWith('../src/')(node.source.value) ||
							String.includes('/src/lib/')(node.source.value) ||
							String.includes('/lib/')(node.source.value))
					) {
						context.report({message: 'Test public export.', node})
					}
				}
			}),
			meta: {messages: {default: 'Test public export.'}, type: 'problem'}
		},
		'no-private-workspace-import': {
			create: context => ({
				ImportDeclaration: node => {
					if (
						/^@deslop\/[^/]+\/(?:src|lib)(?:\/|$)/.test(node.source.value) ||
						/^(?:\.\.\/)+[^/]+\/(?:src|lib)(?:\/|$)/.test(node.source.value)
					) {
						context.report({message: 'Private import; use public export.', node})
					}
				}
			}),
			meta: {messages: {default: 'Private import; use public export.'}, type: 'problem'}
		},
		'no-promise-callback': {
			create: context => ({
				CallExpression: node => {
					if (isPromiseCallbackCall(node)) {
						context.report({message: 'Use Effect or direct async flow instead of Promise callbacks.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect or direct async flow instead of Promise callbacks.'}, type: 'problem'}
		},
		'no-public-raw-domain-string': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (node.declaration?.type !== 'VariableDeclaration') return
					for (const declaration of node.declaration.declarations) {
						if (
							(declaration.init?.type === 'CallExpression' &&
								declaration.init.callee.type === 'MemberExpression' &&
								declaration.init.callee.object.type === 'Identifier' &&
								declaration.init.callee.object.name === 'Schema' &&
								declaration.init.callee.property.type === 'Identifier' &&
								declaration.init.callee.property.name === 'String') ||
							(declaration.init?.type === 'MemberExpression' &&
								declaration.init.object.type === 'Identifier' &&
								declaration.init.object.name === 'Schema' &&
								declaration.init.property.type === 'Identifier' &&
								declaration.init.property.name === 'String')
						) {
							context.report({message: 'Brand domain string.', node: declaration})
						}
					}
				}
			}),
			meta: {messages: {default: 'Brand domain string.'}, type: 'problem'}
		},
		'no-raw-tagged-object': {
			create: context => ({
				ObjectExpression: node => {
					if (hasRawTagProperty(node) && !isSchemaStructObject(node) && !isMatchPatternObject(node)) {
						context.report({message: 'Use schema constructors for tagged values.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use schema constructors for tagged values.'}, type: 'problem'}
		},
		'no-single-use-guard': {
			createOnce: context => ({
				Program: node => {
					for (const statement of node.body) {
						if (
							statement.type === 'FunctionDeclaration' &&
							Predicate.isNotNullish(statement.id) &&
							String.startsWith('is')(statement.id.name) &&
							[...context.sourceCode.text.matchAll(new RegExp(`\\b${statement.id.name}\\b`, 'gu'))].length <= 2
						) {
							context.report({message: 'Inline guard.', node: statement})
						}
					}
				}
			}),
			meta: {messages: {default: 'Inline guard.'}, type: 'problem'}
		},
		'no-single-use-helper': {
			createOnce: context => ({
				Program: node => {
					for (const statement of node.body) {
						if (
							statement.type === 'FunctionDeclaration' &&
							Predicate.isNotNull(statement.id) &&
							!isUppercaseName(statement.id.name) &&
							!isHookName(statement.id.name) &&
							!isRecursiveFunction(context, statement) &&
							isSimpleSingleUseFunction(statement) &&
							[...context.sourceCode.text.matchAll(new RegExp(`\\b${statement.id.name}\\b`, 'gu'))].length <= 2
						) {
							context.report({message: 'Inline one-use helper.', node: statement})
						}
					}
				}
			}),
			meta: {messages: {default: 'Inline one-use helper.'}, type: 'problem'}
		},
		'no-typed-callback-params': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (isCallArgument(node) && !isAtomFamilyCallback(node)) {
						for (const parameter of node.params) {
							if (hasParameterTypeAnnotation(parameter)) {
								context.report({message: 'Infer callback parameter type.', node: parameter})
							}
						}
					}
				},
				FunctionExpression: node => {
					if (isCallArgument(node) && !isAtomFamilyCallback(node) && node.generator) {
						for (const parameter of node.params) {
							if (!hasParameterTypeAnnotation(parameter)) {
								context.report({message: 'Type generator callback parameters.', node: parameter})
							}
						}
					}
					if (isCallArgument(node) && !isAtomFamilyCallback(node) && !node.generator) {
						for (const parameter of node.params) {
							if (hasParameterTypeAnnotation(parameter)) {
								context.report({message: 'Infer callback parameter type.', node: parameter})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Infer callback parameter type.'}, type: 'problem'}
		},
		'no-useless-effect-wrapper': {
			create: context => ({
				CallExpression: node => {
					if (isUselessEffectWrapper(node)) {
						context.report({message: 'Inline useless Effect wrapper.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline useless Effect wrapper.'}, type: 'problem'}
		},
		'no-variable-type-annotation': {
			create: context => ({
				VariableDeclarator: node => {
					if (Predicate.hasProperty(node.id, 'typeAnnotation') && Predicate.isNotNullish(node.id.typeAnnotation)) {
						context.report({message: 'Infer variable type.', node: node.id})
					}
				}
			}),
			meta: {messages: {default: 'Infer variable type.'}, type: 'problem'}
		},
		'no-zero-arg-effect-fn': {
			create: context => ({
				CallExpression: node => {
					if (
						node.callee.type === 'MemberExpression' &&
						node.callee.object.type === 'Identifier' &&
						node.callee.object.name === 'Effect' &&
						node.callee.property.type === 'Identifier' &&
						node.callee.property.name === 'fn' &&
						(node.arguments[0]?.type === 'FunctionExpression' ||
							node.arguments[0]?.type === 'ArrowFunctionExpression') &&
						node.arguments[0].params.length === 0
					) {
						context.report({message: 'Nullary Effect.fn; use Effect.gen.', node})
					}
				}
			}),
			meta: {messages: {default: 'Nullary Effect.fn; use Effect.gen.'}, type: 'problem'}
		},
		'prefer-match': {
			create: context => ({
				BlockStatement: node => {
					for (const [index, statement] of node.body.entries()) {
						if (hasSameDiscriminantNextIf(context, statement, node.body[index + 1])) {
							context.report({message: 'Use Match for repeated discriminant branches.', node: statement})
						}
					}
				},
				IfStatement: node => {
					if (hasSameDiscriminantElseIf(context, node)) {
						context.report({message: 'Use Match for repeated discriminant branches.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Match for repeated discriminant branches.'}, type: 'problem'}
		}
	}
} as const)
