import {Array, Match, Predicate, String, pipe} from 'effect'

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

const isEffectRunCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Effect' &&
	node.callee.property.type === 'Identifier' &&
	(node.callee.property.name === 'runPromise' || node.callee.property.name === 'runSync')

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
	/(?:Schema|Contract|Request|Response|Error|Props|Event|Command|Config|Id|Options|Params|Result|Payload|Handle)$/u.test(
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

const typeReferenceCount = (context: Context, name: string) =>
	[...context.sourceCode.text.matchAll(new RegExp(`\\b${name}\\b`, 'gu'))].length

const isFloatingLocalType = (context: Context, node: ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration) =>
	node.parent.type !== 'ExportNamedDeclaration' &&
	node.parent.type !== 'TSModuleBlock' &&
	(node.type !== 'TSTypeAliasDeclaration' || !isSchemaTypeAlias(node)) &&
	!isBoundaryTypeName(node.id.name) &&
	typeReferenceCount(context, node.id.name) <= 2

const reportFloatingLocalType = (
	context: Context,
	node: ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration
) => {
	if (isFloatingLocalType(context, node)) {
		context.report({
			message:
				'Inline local implementation type; keep a named type only for public boundaries or multiple real consumers.',
			node
		})
	}
}

const isSimpleSingleUseFunction = (node: ESTree.Function) =>
	Predicate.isNotNull(node.body) &&
	node.body.body.length === 1 &&
	node.body.body[0]?.type === 'ReturnStatement' &&
	Predicate.isNotNull(node.body.body[0].argument) &&
	(node.body.body[0].argument.type === 'Identifier' ||
		node.body.body[0].argument.type === 'MemberExpression' ||
		node.body.body[0].argument.type === 'Literal' ||
		node.body.body[0].argument.type === 'TemplateLiteral')

const isAtomFamilyReturnWrapper = (node: ESTree.Function) =>
	node.type === 'FunctionDeclaration' &&
	Predicate.isNotNull(node.id) &&
	String.endsWith('Atom')(node.id.name) &&
	Predicate.isNotNull(node.body) &&
	node.body.body.length === 1 &&
	node.body.body[0]?.type === 'ReturnStatement' &&
	node.body.body[0].argument?.type === 'CallExpression' &&
	node.body.body[0].argument.callee.type === 'Identifier' &&
	String.endsWith('AtomFamily')(node.body.body[0].argument.callee.name)

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

const isReactLocalCollection = (node: ESTree.NewExpression) =>
	node.parent.type === 'CallExpression' &&
	node.parent.callee.type === 'Identifier' &&
	(node.parent.callee.name === 'useRef' || node.parent.callee.name === 'useState')

const isUseStateCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'Identifier' && node.callee.name === 'useState'

function functionObjectExpression(node: ESTree.ArrowFunctionExpression | ESTree.Function) {
	if (node.type === 'ArrowFunctionExpression' && node.body.type === 'ObjectExpression') return [node.body]
	if (
		node.body?.type === 'BlockStatement' &&
		node.body.body.length === 1 &&
		node.body.body[0]?.type === 'ReturnStatement' &&
		node.body.body[0].argument?.type === 'ObjectExpression'
	) {
		return [node.body.body[0].argument]
	}
	return []
}

const isFakeRefStateInitializer = (node: ESTree.Expression | ESTree.SpreadElement | null | undefined) => {
	if (Predicate.isNullish(node)) return false
	if (!(node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')) return false

	const object = functionObjectExpression(node)
	return (
		Predicate.isNotUndefined(object[0]) &&
		Array.some(
			object[0].properties,
			property =>
				property.type === 'Property' &&
				!property.computed &&
				((property.key.type === 'Identifier' && property.key.name === 'current') ||
					(property.key.type === 'Literal' && property.key.value === 'current'))
		)
	)
}

const hasPartialStateParameter = (context: Context, node: ESTree.Function) =>
	/\bPartial\s*<\s*\w*State\b/u.test(pipe(context.sourceCode.text, String.slice(node.start, node.end)))

const isGenericStatePatchFunction = (context: Context, node: ESTree.Function) =>
	node.params.length === 1 &&
	hasPartialStateParameter(context, node) &&
	Predicate.isNotNull(node.body) &&
	/patch|update|merge/u.test(node.id?.name ?? '')

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

const reportTypedParameters = (context: Context, node: ESTree.ArrowFunctionExpression | ESTree.Function) => {
	for (const parameter of node.params) {
		if (hasParameterTypeAnnotation(parameter)) {
			context.report({message: 'Infer callback parameter type.', node: parameter})
		}
	}
}

const isDirectEffectCall = (node: ESTree.Expression) =>
	node.type === 'CallExpression' &&
	node.callee.type === 'MemberExpression' &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Effect' &&
	node.callee.property.type === 'Identifier' &&
	!String.startsWith('run')(node.callee.property.name)

const isDataConstructorCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Data' &&
	node.callee.property.type === 'Identifier' &&
	(node.callee.property.name === 'Class' ||
		node.callee.property.name === 'TaggedClass' ||
		node.callee.property.name === 'taggedEnum')

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

const isEffectFnUntracedCall = (node: ESTree.CallExpression) =>
	node.callee.type === 'MemberExpression' &&
	node.callee.object.type === 'Identifier' &&
	node.callee.object.name === 'Effect' &&
	node.callee.property.type === 'Identifier' &&
	node.callee.property.name === 'fnUntraced'

const isEffectFnGenerator = (node: ESTree.Function) =>
	node.generator &&
	node.parent.type === 'CallExpression' &&
	(isNamedEffectFnCall(node.parent) || isEffectFnUntracedCall(node.parent))

const isContextOwnedContainer = (node: {readonly type: string} | null) =>
	Predicate.isNotNull(node) &&
	(node.type === 'CallExpression' ||
		node.type === 'NewExpression' ||
		node.type === 'ArrayExpression' ||
		node.type === 'JSXExpressionContainer' ||
		node.type === 'ReturnStatement')

const isContextOwnedEffectFnGenerator = (node: ESTree.Function) =>
	isEffectFnGenerator(node) && isContextOwnedContainer(node.parent.parent)

const isTrivialHandlerFunction = (context: Context, node: ESTree.Function) =>
	node.type === 'FunctionDeclaration' &&
	Predicate.isNotNull(node.id) &&
	Predicate.isNotNull(node.body) &&
	[...context.sourceCode.text.matchAll(new RegExp(`\\b${node.id.name}\\b`, 'gu'))].length <= 2 &&
	node.body.body.length <= 2 &&
	Array.every(node.body.body, statement => statement.type === 'ExpressionStatement')

function isStaticReturnExpression(node: ESTree.Expression): boolean {
	return Match.value(node).pipe(
		Match.when({type: 'ArrayExpression'}, array =>
			Array.every(
				array.elements,
				element => Predicate.isNull(element) || (element.type !== 'SpreadElement' && isStaticReturnExpression(element))
			)
		),
		Match.when({type: 'Literal'}, () => true),
		Match.when({type: 'ObjectExpression'}, object =>
			Array.every(
				object.properties,
				property => property.type === 'Property' && isStaticReturnExpression(property.value)
			)
		),
		Match.when({type: 'TemplateLiteral'}, template => Array.isReadonlyArrayEmpty(template.expressions)),
		Match.orElse(() => false)
	)
}

const isStaticReturnFunction = (node: {
	readonly body: ESTree.Expression | ESTree.FunctionBody | null
	readonly generator?: boolean
	readonly parent: {readonly type: string} | null
	readonly params: readonly ESTree.ParamPattern[]
}) =>
	node.generator !== true &&
	node.parent?.type !== 'MethodDefinition' &&
	Predicate.isNotNull(node.body) &&
	node.body.type === 'BlockStatement' &&
	node.params.length === 0 &&
	node.body.body.length === 1 &&
	node.body.body[0]?.type === 'ReturnStatement' &&
	Predicate.isNotNull(node.body.body[0].argument) &&
	isStaticReturnExpression(node.body.body[0].argument)

const isReactRefPropsParameter = (node: ESTree.ObjectPattern) =>
	(node.parent.type === 'FunctionDeclaration' ||
		node.parent.type === 'FunctionExpression' ||
		node.parent.type === 'ArrowFunctionExpression') &&
	Array.some(
		node.properties,
		property => property.type === 'Property' && property.key.type === 'Identifier' && property.key.name === 'ref'
	) &&
	Array.some(node.properties, property => property.type === 'RestElement')

const objectBoxMutationPattern = (name: string) => new RegExp(`\\b${name}\\s*\\.\\s*[^=\\s.]+\\s*=`, 'u')

const isMutableHolderDeclaration = (context: Context, node: ESTree.VariableDeclarator) =>
	node.id.type === 'Identifier' &&
	node.init?.type === 'ObjectExpression' &&
	node.init.properties.length === 1 &&
	Predicate.isNotNull(node.parent.parent) &&
	node.parent.parent.type !== 'Program' &&
	objectBoxMutationPattern(node.id.name).test(context.sourceCode.text)

const isPrimitiveConstDeclaration = (node: ESTree.VariableDeclarator) =>
	node.parent.type === 'VariableDeclaration' &&
	node.parent.kind === 'const' &&
	node.id.type === 'Identifier' &&
	node.init?.type === 'Literal' &&
	(Predicate.isString(node.init.value) ||
		Predicate.isNumber(node.init.value) ||
		Predicate.isBoolean(node.init.value) ||
		Predicate.isNull(node.init.value))

const isComputedStringAccess = (node: ESTree.MemberExpression) =>
	node.computed && node.property.type === 'Literal' && Predicate.isString(node.property.value)

const isAccessExpression = (node: ESTree.Expression) =>
	node.type === 'MemberExpression' || (node.type === 'ChainExpression' && node.expression.type === 'MemberExpression')

const isSchemaDecoderMember = (node: ESTree.MemberExpression) =>
	!node.computed &&
	node.object.type === 'Identifier' &&
	node.object.name === 'Schema' &&
	node.property.type === 'Identifier' &&
	(node.property.name === 'decodeSync' ||
		node.property.name === 'decodeUnknownSync' ||
		node.property.name === 'decodeOption' ||
		node.property.name === 'decodeUnknownOption')

function isSchemaDecoderExpression(node: ESTree.Expression): boolean {
	return (
		(node.type === 'CallExpression' &&
			((node.callee.type === 'MemberExpression' && isSchemaDecoderMember(node.callee)) ||
				(node.callee.type === 'CallExpression' && isSchemaDecoderExpression(node.callee)))) ||
		(node.type === 'MemberExpression' && isSchemaDecoderMember(node))
	)
}

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

function isSchemaClassCall(node: ESTree.Expression): boolean {
	return (
		node.type === 'CallExpression' &&
		((node.callee.type === 'MemberExpression' &&
			!node.callee.computed &&
			node.callee.object.type === 'Identifier' &&
			node.callee.object.name === 'Schema' &&
			node.callee.property.type === 'Identifier' &&
			(node.callee.property.name === 'Class' || node.callee.property.name === 'TaggedClass')) ||
			(node.callee.type === 'CallExpression' && isSchemaClassCall(node.callee)))
	)
}

function isSchemaExpression(node: ESTree.Expression): boolean {
	return (
		(node.type === 'CallExpression' &&
			((node.callee.type === 'MemberExpression' &&
				!node.callee.computed &&
				node.callee.object.type === 'Identifier' &&
				node.callee.object.name === 'Schema') ||
				(node.callee.type === 'CallExpression' && isSchemaExpression(node.callee)))) ||
		(node.type === 'MemberExpression' &&
			!node.computed &&
			node.object.type === 'Identifier' &&
			node.object.name === 'Schema')
	)
}

const isMatchingSchemaTypeAliasStatement = (
	statement: ESTree.Statement | undefined,
	name: string,
	exported: boolean
) => {
	if (
		statement?.type === 'ExportNamedDeclaration' &&
		statement.declaration?.type === 'TSTypeAliasDeclaration' &&
		isSchemaTypeAlias(statement.declaration)
	) {
		return statement.declaration.id.name === name
	}
	if (!exported && statement?.type === 'TSTypeAliasDeclaration' && isSchemaTypeAlias(statement)) {
		return statement.id.name === name
	}
	return false
}

const precedingStatement = (body: readonly ESTree.Statement[], statement: ESTree.Statement) =>
	body[body.indexOf(statement) - 1]

const statementVariableDeclarations = (statement: ESTree.Statement) => {
	if (statement.type === 'VariableDeclaration') return statement.declarations
	if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
		return statement.declaration.declarations
	}
	return []
}

const isSchemaModule = (path: string) =>
	/(?:^|\/)schema\.ts$/u.test(path) || /(?:^|\/)oxlint-plugin\.test\.ts$/u.test(path)

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
						((node.init.type === 'MemberExpression' && (!node.init.computed || isComputedStringAccess(node.init))) ||
							(node.init.type === 'ChainExpression' &&
								node.init.expression.type === 'MemberExpression' &&
								(!node.init.expression.computed || isComputedStringAccess(node.init.expression))))
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
		'no-data-class': {
			create: context => ({
				CallExpression: node => {
					if (isDataConstructorCall(node)) {
						context.report({message: 'Use schema-backed data constructors.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use schema-backed data constructors.'}, type: 'problem'}
		},
		'no-declare-module-export': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (isModuleAugmentationExport(node)) {
						context.report({message: 'Keep module augmentation declarations local.', node})
					}
				}
			}),
			meta: {messages: {default: 'Keep module augmentation declarations local.'}, type: 'problem'}
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
		'no-effect-run-entrypoint': {
			create: context => ({
				CallExpression: node => {
					if (isEffectRunCall(node)) {
						context.report({message: 'Use runtime or atom entrypoints.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use runtime or atom entrypoints.'}, type: 'problem'}
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
						context.report({message: 'Keep local implementation types private.', node: node.declaration})
					}
				}
			}),
			meta: {messages: {default: 'Keep local implementation types private.'}, type: 'problem'}
		},
		'no-fake-ref-state': {
			create: context => ({
				CallExpression: node => {
					if (isUseStateCall(node) && isFakeRefStateInitializer(node.arguments[0])) {
						context.report({message: 'Use a real ref or the lazy ref/value pattern.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use a real ref or the lazy ref/value pattern.'}, type: 'problem'}
		},
		'no-floating-local-type': {
			create: context => ({
				TSInterfaceDeclaration: node => {
					reportFloatingLocalType(context, node)
				},
				TSTypeAliasDeclaration: node => {
					reportFloatingLocalType(context, node)
				}
			}),
			meta: {
				messages: {
					default:
						'Inline local implementation type; keep a named type only for public boundaries or multiple real consumers.'
				},
				type: 'problem'
			}
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
		'no-generic-state-patch': {
			create: context => ({
				FunctionDeclaration: node => {
					if (isGenericStatePatchFunction(context, node)) {
						context.report({message: 'Use inline functional state updates.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use inline functional state updates.'}, type: 'problem'}
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
						context.report({message: 'Use direct expressions.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use direct expressions.'}, type: 'problem'}
		},
		'no-import-alias': {
			create: context => ({
				ImportSpecifier: node => {
					if (node.imported.type === 'Identifier' && node.imported.name !== node.local.name) {
						context.report({message: 'Use imported names directly.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use imported names directly.'}, type: 'problem'}
		},
		'no-json-global': {
			create: context => ({
				CallExpression: node => {
					if (
						node.callee.type === 'MemberExpression' &&
						!node.callee.computed &&
						node.callee.object.type === 'Identifier' &&
						node.callee.object.name === 'JSON' &&
						node.callee.property.type === 'Identifier' &&
						(node.callee.property.name === 'parse' || node.callee.property.name === 'stringify')
					) {
						context.report({message: 'Use Schema JSON decoding/encoding.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Schema JSON decoding/encoding.'}, type: 'problem'}
		},
		'no-let': {
			create: context => ({
				VariableDeclaration: node => {
					if (node.kind === 'let') {
						context.report({message: 'Use expression-oriented values.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use expression-oriented values.'}, type: 'problem'}
		},
		'no-local-mutable-holder': {
			create: context => ({
				VariableDeclarator: node => {
					if (isMutableHolderDeclaration(context, node)) {
						context.report({message: 'Use direct local state.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use direct local state.'}, type: 'problem'}
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
								context.report({message: 'Keep mutable state inside a runtime owner.', node: declaration})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Keep mutable state inside a runtime owner.'}, type: 'problem'}
		},
		'no-native-mutable-collection': {
			create: context => ({
				NewExpression: node => {
					if (isNativeMutableCollection(node) && !isReactLocalCollection(node)) {
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
						context.report({message: 'Use Effect.gen for nullary work.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect.gen for nullary work.'}, type: 'problem'}
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
					if (isReactRefPropsParameter(node)) return

					context.report({message: 'Use property access.', node})
				}
			}),
			meta: {messages: {default: 'Use property access.'}, type: 'problem'}
		},
		'no-option-constructor': {
			create: context => ({
				CallExpression: node => {
					if (isOptionConstructorCall(node)) {
						context.report({message: 'Consume existing Options.', node})
					}
				}
			}),
			meta: {messages: {default: 'Consume existing Options.'}, type: 'problem'}
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
			meta: {messages: {default: 'Use exact optional properties.'}, type: 'problem'}
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
						context.report({message: 'Inline single-use wrapper unless it owns policy or lifecycle.', node})
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
						context.report({message: 'Inline single-use wrapper unless it owns policy or lifecycle.', node})
					}
					if (isTrivialHandlerFunction(context, node)) {
						context.report({message: 'Inline single-use wrapper unless it owns policy or lifecycle.', node})
					}
					if (isAtomFamilyReturnWrapper(node)) {
						context.report({message: 'Inline single-use wrapper unless it owns policy or lifecycle.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline single-use wrapper unless it owns policy or lifecycle.'}, type: 'problem'}
		},
		'no-primitive-const': {
			create: context => ({
				VariableDeclarator: node => {
					if (isPrimitiveConstDeclaration(node)) {
						context.report({message: 'Inline primitive const.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline primitive const.'}, type: 'problem'}
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
						context.report({message: 'Use public package exports.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use public package exports.'}, type: 'problem'}
		},
		'no-promise-callback': {
			create: context => ({
				CallExpression: node => {
					if (isPromiseCallbackCall(node)) {
						context.report({message: 'Use Effect or direct async flow.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect or direct async flow.'}, type: 'problem'}
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
		'no-schema-class': {
			create: context => ({
				CallExpression: node => {
					if (isSchemaClassCall(node)) {
						context.report({message: 'Use Schema.Struct or Schema.TaggedStruct for schema models.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Schema.Struct or Schema.TaggedStruct for schema models.'}, type: 'problem'}
		},
		'no-schema-decoder-alias': {
			create: context => ({
				VariableDeclarator: node => {
					if (node.id.type === 'Identifier' && Predicate.isNotNull(node.init) && isSchemaDecoderExpression(node.init)) {
						context.report({message: 'Inline schema decoding.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline schema decoding.'}, type: 'problem'}
		},
		'no-schema-without-type-export': {
			createOnce: context => ({
				Program: node => {
					if (!isSchemaModule(context.filename)) return
					for (const statement of node.body) {
						for (const declaration of statementVariableDeclarations(statement)) {
							if (
								declaration.id.type === 'Identifier' &&
								isUppercaseName(declaration.id.name) &&
								Predicate.isNotNull(declaration.init) &&
								isSchemaExpression(declaration.init) &&
								!isMatchingSchemaTypeAliasStatement(
									precedingStatement(node.body, statement),
									declaration.id.name,
									statement.type === 'ExportNamedDeclaration'
								)
							) {
								context.report({
									message: 'Place the matching schema type alias immediately before the schema value.',
									node: declaration
								})
							}
						}
					}
				}
			}),
			meta: {
				messages: {default: 'Place the matching schema type alias immediately before the schema value.'},
				type: 'problem'
			}
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
		'no-static-return-function': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (isStaticReturnFunction(node)) {
						context.report({message: 'Inline static return function.', node})
					}
				},
				FunctionDeclaration: node => {
					if (isStaticReturnFunction(node)) {
						context.report({message: 'Inline static return function.', node})
					}
				},
				FunctionExpression: node => {
					if (isStaticReturnFunction(node)) {
						context.report({message: 'Inline static return function.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline static return function.'}, type: 'problem'}
		},
		'no-typed-callback-params': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (isCallArgument(node) && !isAtomFamilyCallback(node)) {
						reportTypedParameters(context, node)
					}
				},
				FunctionExpression: node => {
					if (isCallArgument(node) && !isAtomFamilyCallback(node) && !node.generator) {
						reportTypedParameters(context, node)
					}
					if (isContextOwnedEffectFnGenerator(node)) {
						reportTypedParameters(context, node)
					}
				}
			}),
			meta: {messages: {default: 'Infer callback parameter type.'}, type: 'problem'}
		},
		'no-useless-effect-wrapper': {
			create: context => ({
				CallExpression: node => {
					if (isUselessEffectWrapper(node)) {
						context.report({message: 'Inline Effect wrapper.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline Effect wrapper.'}, type: 'problem'}
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
						context.report({message: 'Use Effect.gen for nullary work.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Effect.gen for nullary work.'}, type: 'problem'}
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
