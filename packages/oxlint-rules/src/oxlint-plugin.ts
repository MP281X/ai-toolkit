import {Array, Predicate, String, pipe} from 'effect'

import {definePlugin} from '@oxlint/plugins'
import type {Context, Definition, ESTree, Scope, Variable} from '@oxlint/plugins'

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function

function definitionVariableDeclarator(definition: Definition) {
	if (definition.node.type === 'VariableDeclarator') return definition.node
	if (definition.name.parent.type === 'VariableDeclarator') return definition.name.parent
	if (
		definition.name.parent.type === 'Property' &&
		definition.name.parent.parent.type === 'ObjectPattern' &&
		definition.name.parent.parent.parent.type === 'VariableDeclarator'
	) {
		return definition.name.parent.parent.parent
	}
	return void 0
}

const arrayMethods = [
	'at',
	'concat',
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
	'slice',
	'some'
] as const

const stringMethods = [
	'at',
	'concat',
	'endsWith',
	'includes',
	'replace',
	'replaceAll',
	'slice',
	'split',
	'startsWith',
	'toLowerCase',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart'
] as const

const mutableCollections = ['Map', 'Set', 'WeakMap', 'WeakSet'] as const
const effectValueMethods = [
	'die',
	'dieMessage',
	'fail',
	'failCause',
	'fromEither',
	'fromNullable',
	'fromOption',
	'gen',
	'interrupt',
	'interruptWith',
	'never',
	'promise',
	'succeed',
	'suspend',
	'sync',
	'try',
	'tryPromise',
	'void'
] as const
const mutatingMethods = [
	'add',
	'clear',
	'copyWithin',
	'delete',
	'fill',
	'pop',
	'push',
	'reverse',
	'set',
	'shift',
	'sort',
	'splice',
	'unshift'
] as const
const schemaDecoderMethods = ['decodeOption', 'decodeSync', 'decodeUnknownOption', 'decodeUnknownSync'] as const

function variableFor(context: Context, node: ESTree.IdentifierReference) {
	let scope: Scope | null = context.sourceCode.getScope(node)
	while (Predicate.isNotNull(scope)) {
		const variable = scope.set.get(node.name)
		if (Predicate.isNotUndefined(variable)) return variable
		scope = scope.upper
	}
	return void 0
}

function importedBinding(
	context: Context,
	node: ESTree.IdentifierReference,
	source: string,
	imported: string,
	namespace = false,
	seen = new Set<Variable>()
): boolean {
	const variable = variableFor(context, node)
	if (Predicate.isUndefined(variable) || seen.has(variable)) return false
	seen.add(variable)
	return (
		Array.some(variable.defs, definition => {
			const binding = definition.node
			if (binding.type === 'ImportNamespaceSpecifier') {
				return namespace && binding.parent.type === 'ImportDeclaration' && binding.parent.source.value === source
			}
			if (
				binding.type !== 'ImportSpecifier' ||
				binding.parent.type !== 'ImportDeclaration' ||
				binding.parent.source.value !== source
			) {
				return false
			}
			if (binding.imported.type === 'Identifier' && binding.imported.name === imported) return true
			return false
		}) ||
		Array.some(variable.defs, definition => {
			const binding = definitionVariableDeclarator(definition)
			return (
				Predicate.isNotUndefined(binding) &&
				!Array.some(variable.references, reference => reference.isWrite() && !reference.init) &&
				((binding.init?.type === 'Identifier' &&
					importedBinding(context, binding.init, source, imported, namespace, seen)) ||
					(binding.init?.type === 'MemberExpression' &&
						binding.init.object.type === 'Identifier' &&
						memberName(binding.init) === imported &&
						importedBinding(context, binding.init.object, source, imported, true, seen)) ||
					(binding.id.type === 'ObjectPattern' &&
						binding.init?.type === 'Identifier' &&
						Array.some(
							binding.id.properties,
							property =>
								property.type === 'Property' &&
								property.key.type === 'Identifier' &&
								property.key.name === imported &&
								property.value.type === 'Identifier' &&
								property.value.name === variable.name
						) &&
						importedBinding(context, binding.init, source, imported, true, seen)))
			)
		})
	)
}

const memberName = (node: ESTree.MemberExpression) => {
	if (!node.computed && node.property.type === 'Identifier') return node.property.name
	if (node.computed && node.property.type === 'Literal' && Predicate.isString(node.property.value)) {
		return node.property.value
	}
	return void 0
}

const objectPropertyName = (property: ESTree.ObjectExpression['properties'][number]) => {
	if (property.type !== 'Property' || property.computed) return
	if (property.key.type === 'Identifier') return property.key.name
	if (property.key.type === 'Literal' && Predicate.isString(property.key.value)) return property.key.value
	return void 0
}

function reactOwns(node: ESTree.NewExpression, range: {readonly end: number; readonly start: number}) {
	if (node.start === range.start && node.end === range.end) return true
	let current: ESTree.Node | null = node.parent
	while (Predicate.isNotNull(current) && range.start <= current.start && range.end >= current.end) {
		if (current.type === 'CallExpression') return false
		if (current.start === range.start && current.end === range.end) return true
		current = current.parent
	}
	return false
}

function importedObject(context: Context, node: ESTree.Expression, source: string, imported: string): boolean {
	if (node.type === 'Identifier') return importedBinding(context, node, source, imported)
	return (
		node.type === 'MemberExpression' &&
		node.object.type === 'Identifier' &&
		memberName(node) === imported &&
		importedBinding(context, node.object, source, imported, true)
	)
}

function importedFunction(context: Context, node: ESTree.Expression, source: string, name: string): boolean {
	return (
		(node.type === 'Identifier' && importedBinding(context, node, source, name)) ||
		(node.type === 'MemberExpression' &&
			node.object.type === 'Identifier' &&
			memberName(node) === name &&
			importedBinding(context, node.object, source, name, true))
	)
}

function importedMethod(
	context: Context,
	node: ESTree.Expression,
	source: string,
	imported: string,
	method: string
): boolean {
	if (node.type === 'MemberExpression' && node.object.type !== 'Super') {
		return memberName(node) === method && importedObject(context, node.object, source, imported)
	}
	if (node.type !== 'Identifier') return false
	const variable = variableFor(context, node)
	if (
		Predicate.isUndefined(variable) ||
		Array.some(variable.references, reference => reference.isWrite() && !reference.init)
	) {
		return false
	}
	return Array.some(variable.defs, definition => {
		const binding = definitionVariableDeclarator(definition)
		return (
			Predicate.isNotUndefined(binding) &&
			((binding.init?.type === 'MemberExpression' &&
				binding.init.object.type !== 'Super' &&
				memberName(binding.init) === method &&
				importedObject(context, binding.init.object, source, imported)) ||
				(binding.id.type === 'ObjectPattern' &&
					Predicate.isNotNull(binding.init) &&
					Array.some(
						binding.id.properties,
						property =>
							property.type === 'Property' &&
							property.key.type === 'Identifier' &&
							property.key.name === method &&
							property.value.type === 'Identifier' &&
							property.value.name === variable.name
					) &&
					importedObject(context, binding.init, source, imported)))
		)
	})
}

function importedMethodName(context: Context, node: ESTree.Expression, source: string, imported: string) {
	if (
		node.type === 'MemberExpression' &&
		node.object.type !== 'Super' &&
		importedObject(context, node.object, source, imported)
	) {
		return memberName(node)
	}
	if (node.type !== 'Identifier') return void 0
	const variable = variableFor(context, node)
	if (
		Predicate.isUndefined(variable) ||
		Array.some(variable.references, reference => reference.isWrite() && !reference.init)
	) {
		return void 0
	}
	const definition = variable.defs[0]
	const declaration = Predicate.isNotUndefined(definition) ? definitionVariableDeclarator(definition) : undefined
	if (declaration?.init?.type === 'MemberExpression' && declaration.init.object.type !== 'Super') {
		return importedObject(context, declaration.init.object, source, imported) ? memberName(declaration.init) : undefined
	}
	if (
		declaration?.id.type === 'ObjectPattern' &&
		Predicate.isNotNull(declaration.init) &&
		importedObject(context, declaration.init, source, imported)
	) {
		const property = Array.findFirst(
			declaration.id.properties,
			item => item.type === 'Property' && item.value.type === 'Identifier' && item.value.name === variable.name
		)
		if (property._tag === 'Some' && property.value.type === 'Property') {
			const key = property.value.key
			if (key.type === 'Identifier') return key.name
			if (key.type === 'Literal' && Predicate.isString(key.value)) return key.value
		}
	}
	return void 0
}

const effectTerminal = (context: Context, node: ESTree.Expression | ESTree.SpreadElement) =>
	node.type !== 'SpreadElement' &&
	(importedMethod(context, node, 'effect', 'Effect', 'runPromise') ||
		importedMethod(context, node, 'effect', 'Effect', 'runSync'))

const isCallArgument = (node: FunctionNode) =>
	node.parent.type === 'CallExpression' ||
	node.parent.type === 'NewExpression' ||
	(node.parent.type === 'Property' &&
		node.parent.parent.type === 'ObjectExpression' &&
		node.parent.parent.parent.type === 'CallExpression')

function directReturnedExpression(node: FunctionNode): ESTree.Expression | undefined {
	if (node.body?.type !== 'BlockStatement') return node.body ?? undefined
	if (node.body.body.length !== 1 || node.body.body[0]?.type !== 'ReturnStatement') return
	return node.body.body[0].argument ?? undefined
}

function returnedExpressions(node: ESTree.ArrowFunctionExpression | ESTree.Function) {
	if (node.body?.type !== 'BlockStatement') return Predicate.isNotNullish(node.body) ? [node.body] : []
	const expressions: ESTree.Expression[] = []
	const visit = (statement: ESTree.Statement) => {
		if (statement.type === 'ReturnStatement' && Predicate.isNotNull(statement.argument)) {
			expressions.push(statement.argument)
		} else if (statement.type === 'BlockStatement') {
			for (const child of statement.body) visit(child)
		} else if (statement.type === 'IfStatement') {
			visit(statement.consequent)
			if (Predicate.isNotNull(statement.alternate)) visit(statement.alternate)
		} else if (statement.type === 'SwitchStatement') {
			for (const switchCase of statement.cases) {
				for (const child of switchCase.consequent) visit(child)
			}
		} else if (statement.type === 'TryStatement') {
			visit(statement.block)
			if (Predicate.isNotNull(statement.handler)) visit(statement.handler.body)
			if (Predicate.isNotNull(statement.finalizer)) visit(statement.finalizer)
		}
	}
	for (const statement of node.body.body) visit(statement)
	return expressions
}

function reactHook(context: Context, node: ESTree.Expression, hook: 'useRef' | 'useState'): boolean {
	if (node.type === 'Identifier' && importedBinding(context, node, 'react', hook)) return true
	if (
		node.type === 'MemberExpression' &&
		node.object.type === 'Identifier' &&
		memberName(node) === hook &&
		importedBinding(context, node.object, 'react', 'React', true)
	) {
		return true
	}
	if (node.type !== 'Identifier') return false
	const variable = variableFor(context, node)
	if (
		Predicate.isUndefined(variable) ||
		Array.some(variable.references, reference => reference.isWrite() && !reference.init)
	) {
		return false
	}
	const definition = variable.defs[0]
	const declaration = Predicate.isNotUndefined(definition) ? definitionVariableDeclarator(definition) : undefined
	return (
		declaration?.id.type === 'ObjectPattern' &&
		declaration.init?.type === 'Identifier' &&
		importedBinding(context, declaration.init, 'react', 'React', true) &&
		Array.some(
			declaration.id.properties,
			property =>
				property.type === 'Property' &&
				property.key.type === 'Identifier' &&
				property.key.name === hook &&
				property.value.type === 'Identifier' &&
				property.value.name === variable.name
		)
	)
}

function directEffectCall(
	context: Context,
	node: ESTree.Expression | undefined,
	aliases?: ReadonlySet<Variable>,
	methods?: ReadonlySet<Variable>
) {
	if (Predicate.isUndefined(node)) return false
	const expression = unwrapExpression(node)
	if (expression.type !== 'CallExpression') return false
	if (
		expression.callee.type === 'MemberExpression' &&
		memberName(expression.callee) === 'pipe' &&
		expression.callee.object.type !== 'Super'
	) {
		if (Array.some(expression.arguments, argument => effectTerminal(context, argument))) return false
		return directEffectCall(context, expression.callee.object, aliases, methods)
	}
	if (
		expression.callee.type !== 'Super' &&
		importedFunction(context, expression.callee, 'effect', 'pipe') &&
		expression.arguments[0]?.type !== 'SpreadElement'
	) {
		if (Array.some(expression.arguments, (argument, index) => index > 0 && effectTerminal(context, argument))) {
			return false
		}
		return directEffectCall(context, expression.arguments[0], aliases, methods)
	}
	const effectObject = expression.callee.type === 'MemberExpression' ? expression.callee.object : undefined
	const aliasVariable = effectObject?.type === 'Identifier' ? variableFor(context, effectObject) : undefined
	const methodVariable = expression.callee.type === 'Identifier' ? variableFor(context, expression.callee) : undefined
	if (expression.callee.type === 'Super') return false
	const methodName = importedMethodName(context, expression.callee, 'effect', 'Effect')
	const inferredMethodName =
		methodName ?? (expression.callee.type === 'MemberExpression' ? memberName(expression.callee) : undefined)
	return (
		(Predicate.isNotUndefined(methodName) ||
			(Predicate.isNotUndefined(methodVariable) && Predicate.isNotUndefined(methods) && methods.has(methodVariable)) ||
			(Predicate.isNotUndefined(aliasVariable) && Predicate.isNotUndefined(aliases) && aliases.has(aliasVariable))) &&
		Predicate.isNotUndefined(inferredMethodName) &&
		Array.contains(effectValueMethods, inferredMethodName)
	)
}

function atomFamilyCallback(context: Context, node: FunctionNode) {
	return (
		node.parent.type === 'CallExpression' &&
		importedMethod(context, node.parent.callee, 'effect/unstable/reactivity', 'Atom', 'family')
	)
}

const hasTypeAnnotation = (node: ESTree.ParamPattern): boolean =>
	(Predicate.hasProperty(node, 'typeAnnotation') && Predicate.isNotNullish(node.typeAnnotation)) ||
	(node.type === 'AssignmentPattern' && hasTypeAnnotation(node.left))

function isUndefinedType(node: ESTree.TSType): boolean {
	if (node.type === 'TSUndefinedKeyword') return true
	if (node.type === 'TSUnionType') return Array.some(node.types, isUndefinedType)
	if (node.type === 'TSParenthesizedType') return isUndefinedType(node.typeAnnotation)
	return false
}

function isGlobalMutableCollection(context: Context, node: ESTree.NewExpression) {
	return (
		node.callee.type === 'Identifier' &&
		Array.contains(mutableCollections, node.callee.name) &&
		context.sourceCode.isGlobalReference(node.callee)
	)
}

function unwrapExpression(node: ESTree.Expression): ESTree.Expression {
	if (
		node.type === 'ParenthesizedExpression' ||
		node.type === 'TSAsExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSTypeAssertion'
	) {
		return unwrapExpression(node.expression)
	}
	return node
}

function receiverKind(context: Context, node: ESTree.Expression): 'array' | 'string' | undefined {
	const expression = unwrapExpression(node)
	if (expression !== node) return receiverKind(context, expression)
	if (node.type === 'ArrayExpression') return 'array'
	if (node.type === 'TemplateLiteral' || (node.type === 'Literal' && Predicate.isString(node.value))) return 'string'
	if (node.type !== 'Identifier') return undefined
	const variable = variableFor(context, node)
	if (Array.some(variable?.references ?? [], reference => reference.isWrite() && !reference.init)) return undefined
	const firstDefinition = variable?.defs[0]
	const definition = Predicate.isNotUndefined(firstDefinition)
		? definitionVariableDeclarator(firstDefinition)
		: undefined
	if (definition?.type !== 'VariableDeclarator' || Predicate.isNull(definition.init)) return undefined
	if (definition.id.type === 'ObjectPattern' && definition.init.type === 'ObjectExpression') {
		const binding = Array.findFirst(
			definition.id.properties,
			property =>
				property.type === 'Property' && property.value.type === 'Identifier' && property.value.name === node.name
		)
		if (binding._tag === 'Some' && binding.value.type === 'Property') {
			const key = binding.value.key
			const value = Array.findFirst(
				definition.init.properties,
				property =>
					property.type === 'Property' &&
					property.key.type === key.type &&
					((property.key.type === 'Identifier' && key.type === 'Identifier' && property.key.name === key.name) ||
						(property.key.type === 'Literal' && key.type === 'Literal' && property.key.value === key.value))
			)
			if (value._tag === 'Some' && value.value.type === 'Property') return receiverKind(context, value.value.value)
		}
	}
	return receiverKind(context, definition.init)
}

function nativePrototypeCall(context: Context, node: ESTree.CallExpression) {
	if (node.callee.type !== 'MemberExpression') return false
	const method = memberName(node.callee)
	if (Predicate.isUndefined(method) || node.callee.object.type === 'Super') return false
	const kind = receiverKind(context, node.callee.object)
	return kind === 'array'
		? Array.contains(arrayMethods, method)
		: kind === 'string' && Array.contains(stringMethods, method)
}

const isNullish = (context: Context, node: ESTree.Expression) =>
	(node.type === 'Literal' && Predicate.isNull(node.value)) ||
	(node.type === 'UnaryExpression' && node.operator === 'void') ||
	(node.type === 'Identifier' && node.name === 'undefined' && context.sourceCode.isGlobalReference(node))

const comparisonOperator = (operator: string) =>
	operator === '===' || operator === '!==' || operator === '==' || operator === '!='

function schemaDecoderFactory(context: Context, node: ESTree.Expression) {
	const callee = node.type === 'CallExpression' ? node.callee : node
	return (
		callee.type !== 'Super' &&
		Array.some(schemaDecoderMethods, method => importedMethod(context, callee, 'effect', 'Schema', method))
	)
}

function schemaExpression(context: Context, node: ESTree.Expression): boolean {
	if (schemaDecoderFactory(context, node)) return false
	if (node.type === 'Identifier') {
		const variable = variableFor(context, node)
		if (
			Predicate.isNotUndefined(variable) &&
			!Array.some(variable.references, reference => reference.isWrite() && !reference.init)
		) {
			const definition = variable.defs[0]
			const declaration = Predicate.isNotUndefined(definition) ? definitionVariableDeclarator(definition) : undefined
			if (
				declaration?.id.type === 'ObjectPattern' &&
				Predicate.isNotNull(declaration.init) &&
				importedObject(context, declaration.init, 'effect', 'Schema') &&
				Array.some(
					declaration.id.properties,
					property =>
						property.type === 'Property' && property.value.type === 'Identifier' && property.value.name === node.name
				)
			) {
				const property = Array.findFirst(
					declaration.id.properties,
					item => item.type === 'Property' && item.value.type === 'Identifier' && item.value.name === node.name
				)
				return property._tag === 'Some' &&
					property.value.type === 'Property' &&
					property.value.key.type === 'Identifier'
					? /^[A-Z]/u.test(property.value.key.name) &&
							property.value.key.name !== 'Class' &&
							property.value.key.name !== 'TaggedClass'
					: false
			}
			if (
				Predicate.isNotUndefined(declaration) &&
				Predicate.isNotNull(declaration.init) &&
				!(declaration.init.type === 'Identifier' && declaration.init.name === node.name) &&
				schemaExpression(context, declaration.init)
			) {
				return true
			}
		}
	}
	const firstArgument = node.type === 'CallExpression' ? node.arguments[0] : undefined
	if (
		node.type === 'CallExpression' &&
		node.callee.type !== 'Super' &&
		importedFunction(context, node.callee, 'effect', 'pipe') &&
		Predicate.isNotUndefined(firstArgument) &&
		firstArgument.type !== 'SpreadElement'
	) {
		if (
			Array.some(
				node.arguments,
				(argument, index) => index > 0 && argument.type !== 'SpreadElement' && schemaDecoderFactory(context, argument)
			)
		) {
			return false
		}
		return schemaExpression(context, firstArgument)
	}
	if (
		node.type === 'MemberExpression' &&
		node.object.type !== 'Super' &&
		importedObject(context, node.object, 'effect', 'Schema')
	) {
		const property = memberName(node)
		return (
			Predicate.isNotUndefined(property) &&
			((/^[A-Z]/u.test(property) && property !== 'Class' && property !== 'TaggedClass') ||
				property === 'declare' ||
				property === 'suspend' ||
				property === 'transform')
		)
	}
	if (node.type === 'MemberExpression' && node.object.type !== 'Super') {
		return (memberName(node) === 'pipe' || memberName(node) === 'annotate') && schemaExpression(context, node.object)
	}
	if (
		node.type === 'CallExpression' &&
		node.callee.type === 'MemberExpression' &&
		memberName(node.callee) === 'pipe' &&
		Array.some(node.arguments, argument => argument.type !== 'SpreadElement' && schemaDecoderFactory(context, argument))
	) {
		return false
	}
	return node.type === 'CallExpression' && node.callee.type !== 'Super' && schemaExpression(context, node.callee)
}

const statementDeclarations = (statement: ESTree.Statement) => {
	if (statement.type === 'VariableDeclaration') return statement.declarations
	if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
		return statement.declaration.declarations
	}
	return []
}

const schemaTypeName = (statement: ESTree.Statement) => {
	let declaration: ESTree.TSTypeAliasDeclaration | undefined
	if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'TSTypeAliasDeclaration') {
		declaration = statement.declaration
	} else if (statement.type === 'TSTypeAliasDeclaration') {
		declaration = statement
	}
	if (
		declaration?.typeAnnotation.type === 'TSTypeQuery' &&
		declaration.typeAnnotation.exprName.type === 'TSQualifiedName' &&
		declaration.typeAnnotation.exprName.left.type === 'Identifier' &&
		declaration.typeAnnotation.exprName.left.name === declaration.id.name &&
		declaration.typeAnnotation.exprName.right.name === 'Type'
	) {
		return {exported: statement.type === 'ExportNamedDeclaration', name: declaration.id.name}
	}
	return void 0
}

const isSchemaModule = (filename: string) => /(?:^|\/)(?:[^/]+\.)?schema\.ts$/u.test(filename)

const rawTag = (node: ESTree.ObjectExpression) =>
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

function insideTaggedConstruction(context: Context, node: ESTree.ObjectExpression) {
	let crossedFunction = false
	for (let parent = node.parent; parent.type !== 'Program'; parent = parent.parent) {
		if (
			parent.type === 'ArrowFunctionExpression' ||
			parent.type === 'FunctionDeclaration' ||
			parent.type === 'FunctionExpression'
		) {
			crossedFunction = true
		}
		if (
			parent.type === 'CallExpression' &&
			parent.callee.type === 'MemberExpression' &&
			parent.callee.object.type !== 'Super' &&
			importedObject(context, parent.callee.object, 'effect', 'Schema') &&
			(memberName(parent.callee) === 'Struct' ||
				memberName(parent.callee) === 'TaggedStruct' ||
				memberName(parent.callee) === 'TaggedError') &&
			!crossedFunction
		) {
			return true
		}
		if (
			parent.type === 'CallExpression' &&
			parent.callee.type !== 'Super' &&
			(importedMethod(context, parent.callee, 'effect', 'Match', 'when') ||
				importedMethod(context, parent.callee, 'effect', 'Match', 'not'))
		) {
			const pattern = parent.arguments[0]
			return Predicate.isNotUndefined(pattern) && pattern.start <= node.start && pattern.end >= node.end
		}
		if (parent.type.endsWith('Statement') || parent.type.endsWith('Declaration')) return false
	}
	return false
}

const effectMemberCall = (context: Context, node: ESTree.Expression, member: string) => {
	const expression = unwrapExpression(node)
	return (
		expression.type === 'CallExpression' &&
		expression.callee.type !== 'Super' &&
		importedMethod(context, expression.callee, 'effect', 'Effect', member)
	)
}

const effectFnCallback = (context: Context, node: ESTree.CallExpression) => {
	if (effectMemberCall(context, node, 'fn')) return node.arguments[0]
	if (node.callee.type === 'CallExpression' && effectMemberCall(context, node.callee, 'fn')) return node.arguments[0]
	return void 0
}

const isFunctionExpression = (
	node: ESTree.Expression | ESTree.SpreadElement | null | undefined
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
	node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'

const directGenWrapper = (context: Context, node: FunctionNode) => {
	const body = directReturnedExpression(node)
	return node.params.length === 0 && Predicate.isNotUndefined(body) && effectMemberCall(context, body, 'gen')
}

function topLevelVariable(node: ESTree.VariableDeclarator) {
	const declaration = node.parent
	return (
		declaration.type === 'VariableDeclaration' &&
		(declaration.parent.type === 'Program' ||
			(declaration.parent.type === 'ExportNamedDeclaration' && declaration.parent.parent.type === 'Program'))
	)
}

const mutableInitializer = (node: ESTree.Expression) => {
	const expression = unwrapExpression(node)
	return expression.type === 'ObjectExpression' || expression.type === 'ArrayExpression'
}

function methodMutableInitializer(context: Context, node: ESTree.Expression): boolean {
	const expression = unwrapExpression(node)
	if (expression !== node) return methodMutableInitializer(context, expression)
	if (node.type === 'ArrayExpression') return true
	if (node.type === 'NewExpression') return isGlobalMutableCollection(context, node)
	return (
		node.type === 'ObjectExpression' &&
		Array.some(
			node.properties,
			property => property.type === 'Property' && methodMutableInitializer(context, property.value)
		)
	)
}

function rootIdentifier(node: ESTree.Expression | ESTree.AssignmentTarget) {
	let current = node
	while (current.type === 'MemberExpression' && current.object.type !== 'Super') current = current.object
	return current.type === 'Identifier' ? current : undefined
}

const comparedSource = (context: Context, node: ESTree.Expression) => {
	if (
		node.type !== 'BinaryExpression' ||
		!(node.operator === '===' || node.operator === '!==') ||
		(node.left.type !== 'Literal' && node.right.type !== 'Literal')
	) {
		return void 0
	}
	const discriminant = node.left.type === 'Literal' ? node.right : node.left
	if (!stableDiscriminant(discriminant)) return void 0
	return pipe(context.sourceCode.text, String.slice(discriminant.start, discriminant.end))
}

function stableDiscriminant(node: ESTree.Expression): boolean {
	return (
		node.type === 'Identifier' ||
		(node.type === 'MemberExpression' && node.object.type !== 'Super' && stableDiscriminant(node.object))
	)
}

const outerDiscriminantChain = (context: Context, node: ESTree.IfStatement) => {
	if (node.parent.type === 'IfStatement' && node.parent.alternate === node) return false
	const source = comparedSource(context, node.test)
	if (Predicate.isUndefined(source)) return false
	let alternate = node.alternate
	let repeats = 0
	while (alternate?.type === 'IfStatement') {
		if (comparedSource(context, alternate.test) !== source) return false
		repeats += 1
		alternate = alternate.alternate
	}
	return repeats > 0
}

export default definePlugin({
	meta: {name: '@deslop/oxlint-rules'},
	rules: {
		'no-atom-family-inferred-arg': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (!atomFamilyCallback(context, node)) return
					for (const parameter of node.params) {
						if (!hasTypeAnnotation(parameter)) context.report({message: 'Type Atom.family argument.', node: parameter})
					}
				},
				FunctionExpression: node => {
					if (!atomFamilyCallback(context, node)) return
					for (const parameter of node.params) {
						if (!hasTypeAnnotation(parameter)) context.report({message: 'Type Atom.family argument.', node: parameter})
					}
				}
			}),
			meta: {messages: {default: 'Type Atom.family argument.'}, type: 'problem'}
		},
		'no-declare-module-export': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (
						node.parent.type === 'TSModuleBlock' &&
						node.parent.parent.type === 'TSModuleDeclaration' &&
						node.parent.parent.id.type === 'Literal'
					) {
						context.report({message: 'Keep module augmentation declarations local.', node})
					}
				}
			}),
			meta: {messages: {default: 'Keep module augmentation declarations local.'}, type: 'problem'}
		},
		'no-effect-returning-function': {
			create: context => {
				const destructuredAliases = new Set<Variable>()
				const destructuredMethods = new Set<Variable>()
				const check = (node: FunctionNode) => {
					if (
						!node.async &&
						!node.generator &&
						node.params.length > 0 &&
						!isCallArgument(node) &&
						!atomFamilyCallback(context, node) &&
						directEffectCall(context, directReturnedExpression(node), destructuredAliases, destructuredMethods)
					) {
						context.report({message: 'Use Effect.fn for functions returning Effect.', node})
					}
				}
				return {
					ArrowFunctionExpression: check,
					FunctionDeclaration: check,
					FunctionExpression: check,
					VariableDeclarator: node => {
						if (
							node.id.type === 'ObjectPattern' &&
							Predicate.isNotNull(node.init) &&
							importedObject(context, node.init, 'effect', 'Effect')
						) {
							for (const property of node.id.properties) {
								if (
									property.type !== 'Property' ||
									property.key.type !== 'Identifier' ||
									String.startsWith('run')(property.key.name) ||
									property.value.type !== 'Identifier'
								) {
									continue
								}
								for (const variable of context.sourceCode.getDeclaredVariables(node)) {
									if (
										variable.name === property.value.name &&
										!Array.some(variable.references, reference => reference.isWrite() && !reference.init)
									) {
										destructuredMethods.add(variable)
									}
								}
							}
						}
						if (
							node.id.type !== 'ObjectPattern' ||
							node.init?.type !== 'Identifier' ||
							!importedBinding(context, node.init, 'effect', 'Effect', true)
						) {
							return
						}
						for (const property of node.id.properties) {
							if (
								property.type !== 'Property' ||
								property.key.type !== 'Identifier' ||
								property.key.name !== 'Effect' ||
								property.value.type !== 'Identifier'
							) {
								continue
							}
							for (const variable of context.sourceCode.getDeclaredVariables(node)) {
								if (variable.name === property.value.name) destructuredAliases.add(variable)
							}
						}
					}
				}
			},
			meta: {messages: {default: 'Use Effect.fn for functions returning Effect.'}, type: 'problem'}
		},
		'no-fake-ref-state': {
			create: context => ({
				CallExpression: node => {
					const useState = node.callee.type !== 'Super' && reactHook(context, node.callee, 'useState')
					const initializer = node.arguments[0]
					if (!useState || !isFunctionExpression(initializer)) return
					const value = directReturnedExpression(initializer)
					if (
						value?.type === 'ObjectExpression' &&
						value.properties.length === 1 &&
						value.properties[0]?.type === 'Property' &&
						!value.properties[0].computed &&
						((value.properties[0].key.type === 'Identifier' && value.properties[0].key.name === 'current') ||
							(value.properties[0].key.type === 'Literal' && value.properties[0].key.value === 'current'))
					) {
						context.report({message: 'Use a real ref or the lazy ref/value pattern.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use a real ref or the lazy ref/value pattern.'}, type: 'problem'}
		},
		'no-module-mutable-state': {
			create: context => {
				const aliases = new Map<Variable, {readonly nested: boolean; readonly target: Variable}>()
				const candidates = new Map<
					Variable,
					{readonly array: boolean; readonly nestedMutable: boolean; readonly node: ESTree.VariableDeclarator}
				>()
				const methodMutatedDirect = new Set<Variable>()
				const methodMutatedNested = new Set<Variable>()
				const mutated = new Set<Variable>()
				const aliasFor = (variable: Variable) => {
					const definition = variable.defs[0]
					const declaration = Predicate.isNotUndefined(definition)
						? definitionVariableDeclarator(definition)
						: undefined
					if (declaration?.id.type !== 'ObjectPattern' || declaration.init?.type !== 'Identifier') {
						return aliases.get(variable)
					}
					const target = variableFor(context, declaration.init)
					return Predicate.isNotUndefined(target) ? {nested: true, target} : aliases.get(variable)
				}
				const aliasIsNested = (variable: Variable) => {
					const visited = new Set<Variable>()
					let current = variable
					while (Predicate.isNotUndefined(aliasFor(current)) && !visited.has(current)) {
						visited.add(current)
						const alias = aliasFor(current)
						if (alias?.nested === true) return true
						current = alias?.target ?? current
					}
					return false
				}
				const initializerFor = (
					expression: ESTree.Expression,
					seen = new Set<Variable>()
				): ESTree.Expression | undefined => {
					const unwrapped = unwrapExpression(expression)
					if (unwrapped.type === 'Identifier') {
						const variable = variableFor(context, unwrapped)
						if (Predicate.isUndefined(variable) || seen.has(variable)) return
						seen.add(variable)
						const definition = variable.defs[0]
						const declaration = Predicate.isNotUndefined(definition)
							? definitionVariableDeclarator(definition)
							: undefined
						if (
							declaration?.id.type === 'ObjectPattern' &&
							(declaration.init?.type === 'Identifier' || declaration.init?.type === 'MemberExpression')
						) {
							const property = Array.findFirst(
								declaration.id.properties,
								item =>
									item.type === 'Property' && item.value.type === 'Identifier' && item.value.name === unwrapped.name
							)
							const source = initializerFor(declaration.init, seen)
							if (property._tag === 'Some' && source?.type === 'ObjectExpression') {
								const key =
									property.value.type === 'Property' && property.value.key.type === 'Identifier'
										? property.value.key.name
										: undefined
								const value = Array.findFirst(source.properties, item => objectPropertyName(item) === key)
								if (value._tag === 'Some' && value.value.type === 'Property') return value.value.value
							}
						}
						return Predicate.isNotNullish(declaration?.init) ? initializerFor(declaration.init, seen) : undefined
					}
					if (unwrapped.type === 'MemberExpression' && unwrapped.object.type !== 'Super') {
						const source = initializerFor(unwrapped.object, seen)
						if (source?.type !== 'ObjectExpression') return
						const property = memberName(unwrapped)
						const value = Array.findFirst(source.properties, item => objectPropertyName(item) === property)
						if (value._tag === 'Some' && value.value.type === 'Property') return value.value.value
						return
					}
					return unwrapped
				}
				const mutableMethodReceiver = (expression: ESTree.Expression) => {
					const initializer = initializerFor(expression)
					if (Predicate.isUndefined(initializer)) return false
					const unwrapped = unwrapExpression(initializer)
					return (
						unwrapped.type === 'ArrayExpression' ||
						(unwrapped.type === 'NewExpression' && isGlobalMutableCollection(context, unwrapped))
					)
				}
				const mark = (expression: ESTree.Expression | ESTree.AssignmentTarget, method = false) => {
					const root = rootIdentifier(expression)
					if (Predicate.isUndefined(root)) return
					const variable = variableFor(context, root)
					if (Predicate.isUndefined(variable)) return
					if (!method) mutated.add(variable)
					else if (expression.type === 'MemberExpression' || aliasIsNested(variable)) methodMutatedNested.add(variable)
					else methodMutatedDirect.add(variable)
				}
				const aliasRoot = (variable: Variable) => {
					const visited = new Set<Variable>()
					let current = variable
					while (Predicate.isNotUndefined(aliasFor(current)) && !visited.has(current)) {
						visited.add(current)
						current = aliasFor(current)?.target ?? current
					}
					return current
				}
				return {
					AssignmentExpression: node => {
						mark(node.left)
					},
					CallExpression: node => {
						if (
							node.callee.type === 'MemberExpression' &&
							Array.contains(mutatingMethods, memberName(node.callee) ?? '') &&
							node.callee.object.type !== 'Super' &&
							mutableMethodReceiver(node.callee.object)
						) {
							mark(node.callee.object, true)
						}
						if (
							node.callee.type === 'MemberExpression' &&
							node.callee.object.type === 'Identifier' &&
							node.callee.object.name === 'Object' &&
							context.sourceCode.isGlobalReference(node.callee.object) &&
							(memberName(node.callee) === 'assign' || memberName(node.callee) === 'defineProperty')
						) {
							const target = node.arguments[0]
							if (Predicate.isNotUndefined(target) && target.type !== 'SpreadElement') mark(target)
						}
					},
					'Program:exit': () => {
						for (const [variable, candidate] of candidates) {
							if (
								Array.some([...mutated], mutation => aliasRoot(mutation) === variable) ||
								(candidate.array &&
									Array.some([...methodMutatedDirect], mutation => aliasRoot(mutation) === variable)) ||
								(candidate.nestedMutable &&
									Array.some([...methodMutatedNested], mutation => aliasRoot(mutation) === variable))
							) {
								context.report({message: 'Keep mutable state inside a runtime owner.', node: candidate.node})
							}
						}
					},
					UnaryExpression: node => {
						if (node.operator === 'delete') mark(node.argument)
					},
					UpdateExpression: node => {
						mark(node.argument)
					},
					VariableDeclarator: node => {
						const variable = context.sourceCode.getDeclaredVariables(node)[0]
						if (
							node.id.type === 'ObjectPattern' &&
							(node.init?.type === 'Identifier' || node.init?.type === 'MemberExpression')
						) {
							const root = rootIdentifier(node.init)
							const target = Predicate.isNotUndefined(root) ? variableFor(context, root) : undefined
							if (Predicate.isNotUndefined(target)) {
								for (const property of node.id.properties) {
									if (property.type !== 'Property' || property.value.type !== 'Identifier') continue
									const propertyName = property.value.name
									const declared = Array.findFirst(
										context.sourceCode.getDeclaredVariables(node),
										item => item.name === propertyName
									)
									if (
										declared._tag === 'Some' &&
										!Array.some(declared.value.references, reference => reference.isWrite() && !reference.init)
									) {
										aliases.set(declared.value, {nested: true, target})
									}
								}
							}
						}
						if (
							Predicate.isNotUndefined(variable) &&
							(node.init?.type === 'Identifier' || node.init?.type === 'MemberExpression')
						) {
							const root = rootIdentifier(node.init)
							const target = Predicate.isNotUndefined(root) ? variableFor(context, root) : undefined
							if (
								Predicate.isNotUndefined(target) &&
								!Array.some(variable.references, reference => reference.isWrite() && !reference.init)
							) {
								aliases.set(variable, {nested: node.init.type === 'MemberExpression', target})
							}
						}
						if (
							topLevelVariable(node) &&
							Predicate.isNotUndefined(variable) &&
							Predicate.isNotNull(node.init) &&
							mutableInitializer(node.init)
						) {
							candidates.set(variable, {
								array: unwrapExpression(node.init).type === 'ArrayExpression',
								nestedMutable:
									unwrapExpression(node.init).type === 'ObjectExpression' &&
									methodMutableInitializer(context, node.init),
								node
							})
						}
					}
				}
			},
			meta: {messages: {default: 'Keep mutable state inside a runtime owner.'}, type: 'problem'}
		},
		'no-native-mutable-collection': {
			create: context => {
				const candidates: ESTree.NewExpression[] = []
				const reactNamespaces = new Set<Variable>()
				const reactOwnedRanges: {readonly end: number; readonly start: number}[] = []
				const reactOwners = new Set<Variable>()
				return {
					CallExpression: node => {
						const calleeVariable = node.callee.type === 'Identifier' ? variableFor(context, node.callee) : undefined
						const namespaceVariable =
							node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier'
								? variableFor(context, node.callee.object)
								: undefined
						const owned =
							(Predicate.isNotUndefined(calleeVariable) && reactOwners.has(calleeVariable)) ||
							(node.callee.type === 'MemberExpression' &&
								node.callee.object.type === 'Identifier' &&
								Predicate.isNotUndefined(namespaceVariable) &&
								reactNamespaces.has(namespaceVariable) &&
								(memberName(node.callee) === 'useRef' || memberName(node.callee) === 'useState'))
						if (!owned) return
						for (const argument of node.arguments) {
							if (argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression') {
								for (const returned of returnedExpressions(argument)) {
									const expression = unwrapExpression(returned)
									if (expression.type === 'Identifier') {
										const definition = variableFor(context, expression)?.defs[0]?.node
										if (
											definition?.type === 'VariableDeclarator' &&
											!topLevelVariable(definition) &&
											Predicate.isNotNull(definition.init)
										) {
											const initializer = unwrapExpression(definition.init)
											if (
												initializer.type === 'ArrayExpression' ||
												initializer.type === 'NewExpression' ||
												initializer.type === 'ObjectExpression'
											) {
												reactOwnedRanges.push(initializer)
											}
										}
									} else {
										reactOwnedRanges.push(expression)
									}
								}
							} else if (argument.type !== 'SpreadElement') {
								const expression = unwrapExpression(argument)
								if (
									expression.type === 'ArrayExpression' ||
									expression.type === 'NewExpression' ||
									expression.type === 'ObjectExpression'
								) {
									reactOwnedRanges.push(expression)
								}
							}
						}
					},
					ImportDeclaration: node => {
						if (node.source.value !== 'react') return
						for (const specifier of node.specifiers) {
							const variable = context.sourceCode.getDeclaredVariables(specifier)[0]
							if (Predicate.isUndefined(variable)) continue
							if (specifier.type === 'ImportNamespaceSpecifier') reactNamespaces.add(variable)
							if (
								specifier.type === 'ImportSpecifier' &&
								specifier.imported.type === 'Identifier' &&
								(specifier.imported.name === 'useRef' || specifier.imported.name === 'useState')
							) {
								reactOwners.add(variable)
							}
						}
					},
					NewExpression: node => {
						if (isGlobalMutableCollection(context, node)) candidates.push(node)
					},
					'Program:exit': () => {
						for (const node of candidates) {
							const owned = Array.some(reactOwnedRanges, range => reactOwns(node, range))
							if (!owned) context.report({message: 'Use Effect data structures or domain state.', node})
						}
					},
					VariableDeclarator: node => {
						if (node.id.type === 'ObjectPattern' && node.init?.type === 'Identifier') {
							const source = variableFor(context, node.init)
							if (Predicate.isNotUndefined(source) && reactNamespaces.has(source)) {
								for (const property of node.id.properties) {
									if (
										property.type !== 'Property' ||
										property.key.type !== 'Identifier' ||
										!(property.key.name === 'useRef' || property.key.name === 'useState') ||
										property.value.type !== 'Identifier'
									) {
										continue
									}
									for (const declared of context.sourceCode.getDeclaredVariables(node)) {
										if (
											declared.name === property.value.name &&
											!Array.some(declared.references, reference => reference.isWrite() && !reference.init)
										) {
											reactOwners.add(declared)
										}
									}
								}
							}
						}
						if (node.id.type !== 'Identifier' || Predicate.isNull(node.init)) return
						const target = context.sourceCode.getDeclaredVariables(node)[0]
						if (Predicate.isUndefined(target)) return
						const identifierSource = node.init.type === 'Identifier' ? variableFor(context, node.init) : undefined
						const namespaceSource =
							node.init.type === 'MemberExpression' && node.init.object.type === 'Identifier'
								? variableFor(context, node.init.object)
								: undefined
						const reassigned = Array.some(target.references, reference => reference.isWrite() && !reference.init)
						if (!reassigned && Predicate.isNotUndefined(identifierSource) && reactOwners.has(identifierSource)) {
							reactOwners.add(target)
						}
						if (!reassigned && Predicate.isNotUndefined(identifierSource) && reactNamespaces.has(identifierSource)) {
							reactNamespaces.add(target)
						}
						if (
							!reassigned &&
							node.init.type === 'MemberExpression' &&
							Predicate.isNotUndefined(namespaceSource) &&
							reactNamespaces.has(namespaceSource) &&
							(memberName(node.init) === 'useRef' || memberName(node.init) === 'useState')
						) {
							reactOwners.add(target)
						}
					}
				}
			},
			meta: {messages: {default: 'Use Effect data structures or domain state.'}, type: 'problem'}
		},
		'no-native-prototype-method': {
			create: context => ({
				CallExpression: node => {
					if (nativePrototypeCall(context, node)) context.report({message: 'Use Effect module functions.', node})
				}
			}),
			meta: {messages: {default: 'Use Effect module functions.'}, type: 'problem'}
		},
		'no-nullish-comparison': {
			create: context => ({
				BinaryExpression: node => {
					if (comparisonOperator(node.operator) && (isNullish(context, node.left) || isNullish(context, node.right))) {
						context.report({message: 'Use Predicate for nullish checks.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Predicate for nullish checks.'}, type: 'problem'}
		},
		'no-optional-undefined-property': {
			create: context => ({
				TSPropertySignature: node => {
					if (
						node.optional === true &&
						Predicate.isNotNullish(node.typeAnnotation) &&
						isUndefinedType(node.typeAnnotation.typeAnnotation)
					) {
						context.report({message: 'Use exact optional properties.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use exact optional properties.'}, type: 'problem'}
		},
		'no-private-workspace-import': {
			create: context => ({
				ImportExpression: node => {
					let source: string | undefined
					if (node.source.type === 'Literal' && Predicate.isString(node.source.value)) source = node.source.value
					if (
						node.source.type === 'TemplateLiteral' &&
						Array.isReadonlyArrayEmpty(node.source.expressions) &&
						Predicate.isNotUndefined(node.source.quasis[0])
					) {
						const cooked = node.source.quasis[0].value.cooked
						if (Predicate.isString(cooked)) source = cooked
					}
					if (
						Predicate.isString(source) &&
						(/^@deslop\/[^/]+\/(?:src|lib)(?:\/|$)/u.test(source) ||
							/^(?:\.\.\/)+(?:packages\/)?[^/]+\/(?:src|lib)(?:\/|$)/u.test(source))
					) {
						context.report({message: 'Use public package exports.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use public package exports.'}, type: 'problem'}
		},
		'no-raw-tagged-object': {
			create: context => ({
				ObjectExpression: node => {
					if (rawTag(node) && !insideTaggedConstruction(context, node)) {
						context.report({message: 'Use schema constructors for tagged values.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use schema constructors for tagged values.'}, type: 'problem'}
		},
		'no-restricted-library-api': {
			create: context => ({
				CallExpression: node => {
					if (node.callee.type !== 'Identifier') return
					const definition = variableFor(context, node.callee)?.defs[0]
					const declaration = Predicate.isNotUndefined(definition)
						? definitionVariableDeclarator(definition)
						: undefined
					if (declaration?.init?.type === 'MemberExpression') return
					let message: string | undefined
					if (
						importedMethod(context, node.callee, 'effect', 'Effect', 'runPromise') ||
						importedMethod(context, node.callee, 'effect', 'Effect', 'runSync')
					) {
						message = 'Use runtime or atom entrypoints.'
					}
					if (
						importedMethod(context, node.callee, 'effect', 'Data', 'Class') ||
						importedMethod(context, node.callee, 'effect', 'Data', 'TaggedClass') ||
						importedMethod(context, node.callee, 'effect', 'Data', 'taggedEnum')
					) {
						message = 'Use schema-backed data constructors.'
					}
					if (
						importedMethod(context, node.callee, 'effect', 'Schema', 'Class') ||
						importedMethod(context, node.callee, 'effect', 'Schema', 'TaggedClass')
					) {
						message = 'Use Schema.Struct or Schema.TaggedStruct.'
					}
					if (Predicate.isNotUndefined(message)) context.report({message, node})
				},
				MemberExpression: node => {
					if (node.object.type === 'Super') return
					const property = memberName(node)
					let message: string | undefined
					if (
						node.object.type === 'Identifier' &&
						node.object.name === 'JSON' &&
						context.sourceCode.isGlobalReference(node.object) &&
						(property === 'parse' || property === 'stringify')
					) {
						message = 'Use Schema JSON decoding/encoding.'
					}
					if (
						importedObject(context, node.object, 'effect', 'Data') &&
						(property === 'Class' || property === 'TaggedClass' || property === 'taggedEnum')
					) {
						message = 'Use schema-backed data constructors.'
					}
					if (
						importedObject(context, node.object, 'effect', 'Effect') &&
						(property === 'runPromise' || property === 'runSync')
					) {
						message = 'Use runtime or atom entrypoints.'
					}
					if (
						importedObject(context, node.object, 'effect', 'Schema') &&
						(property === 'Class' || property === 'TaggedClass')
					) {
						message = 'Use Schema.Struct or Schema.TaggedStruct.'
					}
					if (Predicate.isNotUndefined(message)) context.report({message, node})
				}
			}),
			meta: {messages: {default: 'Use an approved library API.'}, type: 'problem'}
		},
		'no-redundant-effect-wrapper': {
			create: context => {
				const checkFunction = (node: FunctionNode) => {
					const ownedByEffectFn =
						node.parent.type === 'CallExpression' && effectFnCallback(context, node.parent) === node
					if (directGenWrapper(context, node) && !ownedByEffectFn && !isCallArgument(node)) {
						context.report({message: 'Use the Effect value directly.', node})
					}
				}
				return {
					ArrowFunctionExpression: checkFunction,
					CallExpression: node => {
						const callback = effectFnCallback(context, node)
						if (isFunctionExpression(callback) && callback.params.length === 0) {
							context.report({message: 'Use Effect.gen for nullary work.', node})
						}
					},
					FunctionDeclaration: checkFunction,
					FunctionExpression: checkFunction
				}
			},
			meta: {messages: {default: 'Remove the redundant Effect wrapper.'}, type: 'problem'}
		},
		'no-schema-decoder-alias': {
			create: context => ({
				VariableDeclarator: node => {
					const destructuredDecoder =
						node.id.type === 'ObjectPattern' &&
						Predicate.isNotNull(node.init) &&
						importedObject(context, node.init, 'effect', 'Schema') &&
						Array.some(node.id.properties, property => {
							if (property.type !== 'Property') return false
							let name: string | undefined
							if (property.key.type === 'Identifier') name = property.key.name
							if (property.key.type === 'Literal' && Predicate.isString(property.key.value)) {
								name = property.key.value
							}
							return Array.contains(schemaDecoderMethods, name ?? '')
						})
					if (destructuredDecoder || (Predicate.isNotNull(node.init) && schemaDecoderFactory(context, node.init))) {
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
					const types = new Map<string, boolean>()
					for (const statement of node.body) {
						const type = schemaTypeName(statement)
						if (Predicate.isNotUndefined(type)) types.set(type.name, type.exported)
					}
					for (const statement of node.body) {
						for (const declaration of statementDeclarations(statement)) {
							if (
								declaration.id.type === 'Identifier' &&
								/^[A-Z]/u.test(declaration.id.name) &&
								Predicate.isNotNull(declaration.init) &&
								schemaExpression(context, declaration.init) &&
								types.get(declaration.id.name) !== (statement.type === 'ExportNamedDeclaration')
							) {
								context.report({
									message: 'Add a matching schema type alias with the same export visibility.',
									node: declaration
								})
							}
						}
					}
				}
			}),
			meta: {messages: {default: 'Add a matching schema type alias with the same export visibility.'}, type: 'problem'}
		},
		'prefer-match': {
			create: context => ({
				IfStatement: node => {
					if (outerDiscriminantChain(context, node)) {
						context.report({message: 'Use Match for repeated discriminant branches.', node})
					}
				}
			}),
			meta: {messages: {default: 'Use Match for repeated discriminant branches.'}, type: 'problem'}
		}
	}
} as const)
