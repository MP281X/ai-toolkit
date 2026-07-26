import {definePlugin} from '@oxlint/plugins'
import type {Context, ESTree, Scope, Variable} from '@oxlint/plugins'

const functionTypes = ['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression'] as const

function memberName(node: ESTree.MemberExpression) {
	if (!node.computed && node.property.type === 'Identifier') return node.property.name
	if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
		return node.property.value
	}
	return undefined
}

function variableFromScope(input: {readonly scope: Scope | null; readonly name: string}): Variable | undefined {
	if (input.scope === null) return undefined
	return input.scope.set.get(input.name) ?? variableFromScope({name: input.name, scope: input.scope.upper})
}

function isImportBinding(input: {
	readonly context: Context
	readonly node: ESTree.IdentifierReference
	readonly source: string
	readonly importedName: string
}) {
	const variable = variableFromScope({name: input.node.name, scope: input.context.sourceCode.getScope(input.node)})
	return (
		variable?.defs.some(
			definition =>
				definition.type === 'ImportBinding' &&
				definition.node.type === 'ImportSpecifier' &&
				definition.parent?.type === 'ImportDeclaration' &&
				definition.parent.source.value === input.source &&
				definition.node.imported.type === 'Identifier' &&
				definition.node.imported.name === input.importedName
		) === true
	)
}

function importedMember(input: {
	readonly context: Context
	readonly node: ESTree.Expression
	readonly importedName: string
	readonly propertyName?: string
}): input is {
	readonly context: Context
	readonly node: ESTree.MemberExpression
	readonly importedName: string
	readonly propertyName?: string
} {
	return (
		input.node.type === 'MemberExpression' &&
		input.node.object.type === 'Identifier' &&
		isImportBinding({
			context: input.context,
			importedName: input.importedName,
			node: input.node.object,
			source: input.importedName === 'Atom' ? 'effect/unstable/reactivity' : 'effect'
		}) &&
		(input.propertyName === undefined || memberName(input.node) === input.propertyName)
	)
}

function importedMemberCall(input: {
	readonly context: Context
	readonly node: ESTree.Expression
	readonly importedName: string
	readonly propertyName?: string
}): input is {
	readonly context: Context
	readonly node: ESTree.CallExpression
	readonly importedName: string
	readonly propertyName?: string
} {
	return (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'MemberExpression' &&
		importedMember({
			context: input.context,
			importedName: input.importedName,
			node: input.node.callee,
			propertyName: input.propertyName
		})
	)
}

function expressionRoot(node: ESTree.Expression): ESTree.Expression {
	if (node.type === 'MemberExpression') return expressionRoot(node.object)
	if (node.type === 'CallExpression' && node.callee.type !== 'Super') return expressionRoot(node.callee)
	if (node.type === 'ChainExpression') return expressionRoot(node.expression)
	if (node.type === 'TSInstantiationExpression') return expressionRoot(node.expression)
	return node
}

function expressionUsesImport(input: {
	readonly context: Context
	readonly node: ESTree.Expression
	readonly importedName: string
}) {
	const root = expressionRoot(input.node)
	return (
		root.type === 'Identifier' &&
		isImportBinding({
			context: input.context,
			importedName: input.importedName,
			node: root,
			source: input.importedName === 'Atom' ? 'effect/unstable/reactivity' : 'effect'
		})
	)
}

function isFunction(node: ESTree.Node): node is ESTree.Function | ESTree.ArrowFunctionExpression {
	return functionTypes.some(type => type === node.type)
}

function isEffectFnCallback(input: {
	readonly context: Context
	readonly node: ESTree.Function | ESTree.ArrowFunctionExpression
}) {
	if (input.node.parent.type !== 'CallExpression') return false
	return (
		isEffectFnFactory({context: input.context, node: input.node.parent}) ||
		(input.node.parent.callee.type === 'CallExpression' &&
			isEffectFnFactory({context: input.context, node: input.node.parent.callee}))
	)
}

function propertyKey(node: ESTree.ObjectProperty) {
	if (!node.computed && node.key.type === 'Identifier') return node.key.name
	if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value
	return undefined
}

function isRuleCallback(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.parent.type !== 'Property') return false
	const directKey = propertyKey(node.parent)
	if (directKey === 'create' || directKey === 'createOnce') return true
	if (node.parent.parent.type !== 'ObjectExpression' || node.parent.parent.parent.type !== 'ArrowFunctionExpression') {
		return false
	}
	return (
		node.parent.parent.parent.parent.type === 'Property' &&
		(propertyKey(node.parent.parent.parent.parent) === 'create' ||
			propertyKey(node.parent.parent.parent.parent) === 'createOnce')
	)
}

function isContextualObjectCallback(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.parent.type !== 'Property' || node.parent.parent.type !== 'ObjectExpression') return false
	if (node.parent.parent.parent.type === 'CallExpression') return true
	if (node.parent.parent.parent.type === 'TSSatisfiesExpression') return true
	return (
		node.parent.parent.parent.type === 'ArrowFunctionExpression' &&
		node.parent.parent.parent.body === node.parent.parent &&
		node.parent.parent.parent.parent.type === 'CallExpression'
	)
}

function isSchemaCompilerCall(input: {readonly context: Context; readonly node: ESTree.CallExpression}) {
	if (
		input.node.callee.type !== 'MemberExpression' ||
		!importedMember({context: input.context, importedName: 'Schema', node: input.node.callee})
	) {
		return false
	}
	const name = memberName(input.node.callee)
	return name?.startsWith('decode') === true || name?.startsWith('encode') === true
}

function isInlineSchemaCompiler(input: {readonly context: Context; readonly node: ESTree.CallExpression}) {
	if (input.node.parent.type !== 'CallExpression') return false
	if (input.node.parent.callee === input.node) return true
	return (
		input.node.parent.callee.type === 'MemberExpression' &&
		(importedMember({context: input.context, importedName: 'Effect', node: input.node.parent.callee}) ||
			importedMember({context: input.context, importedName: 'Stream', node: input.node.parent.callee}))
	)
}

function schemaDefinitionMember(node: ESTree.Expression): ESTree.MemberExpression | undefined {
	if (node.type === 'CallExpression' && node.callee.type !== 'Super') return schemaDefinitionMember(node.callee)
	if (node.type === 'TSInstantiationExpression') return schemaDefinitionMember(node.expression)
	if (node.type === 'MemberExpression' && memberName(node) === 'pipe') return schemaDefinitionMember(node.object)
	return node.type === 'MemberExpression' ? node : undefined
}

function isSchemaDefinition(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	if (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'pipe', node: input.node.callee, source: 'effect'}) &&
		input.node.arguments[0]?.type !== 'SpreadElement' &&
		input.node.arguments[0] !== undefined
	) {
		return isSchemaDefinition({context: input.context, node: input.node.arguments[0]})
	}
	if (!expressionUsesImport({context: input.context, importedName: 'Schema', node: input.node})) return false
	const current = schemaDefinitionMember(input.node)
	if (current === undefined || !importedMember({context: input.context, importedName: 'Schema', node: current})) {
		return false
	}
	const name = memberName(current)
	return name?.startsWith('decode') !== true && name?.startsWith('encode') !== true
}

function declaredAtModuleScope(node: ESTree.VariableDeclarator) {
	return (
		node.parent.type === 'VariableDeclaration' &&
		(node.parent.parent.type === 'Program' || node.parent.parent.type === 'ExportNamedDeclaration')
	)
}

function definitionExpression(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	if (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'pipe', node: input.node.callee, source: 'effect'}) &&
		input.node.arguments[0]?.type !== 'SpreadElement' &&
		input.node.arguments[0] !== undefined
	) {
		return definitionExpression({context: input.context, node: input.node.arguments[0]})
	}
	return (
		isSchemaDefinition({context: input.context, node: input.node}) ||
		expressionUsesImport({context: input.context, importedName: 'Layer', node: input.node}) ||
		expressionUsesImport({context: input.context, importedName: 'Schedule', node: input.node}) ||
		expressionUsesImport({context: input.context, importedName: 'Config', node: input.node}) ||
		importedMemberCall({context: input.context, importedName: 'Context', node: input.node, propertyName: 'Tag'}) ||
		importedMemberCall({context: input.context, importedName: 'Context', node: input.node, propertyName: 'Service'}) ||
		importedMemberCall({context: input.context, importedName: 'Effect', node: input.node, propertyName: 'Tag'}) ||
		importedMemberCall({context: input.context, importedName: 'Effect', node: input.node, propertyName: 'Service'})
	)
}

function isAccessAlias(node: ESTree.Expression): boolean {
	if (node.type === 'ChainExpression') return isAccessAlias(node.expression)
	if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion' || node.type === 'TSNonNullExpression') {
		return isAccessAlias(node.expression)
	}
	if (node.type === 'AwaitExpression') return isAccessAlias(node.argument)
	return node.type === 'MemberExpression'
}

function expressionAtModuleScope(node: ESTree.Node): boolean {
	if (node.type === 'Program') return true
	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'StaticBlock'
	) {
		return false
	}
	return expressionAtModuleScope(node.parent)
}

function referencesFunctionParameter(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	let scope: Scope | null = input.context.sourceCode.getScope(input.node)
	while (scope !== null && scope.type !== 'function') scope = scope.upper
	return (
		scope?.variables.some(
			variable =>
				variable.defs.some(definition => definition.type === 'Parameter') &&
				variable.references.some(
					reference => reference.identifier.start >= input.node.start && reference.identifier.end <= input.node.end
				)
		) === true
	)
}

function previousStatement(input: {readonly program: ESTree.Program; readonly statement: ESTree.Statement}) {
	const index = input.program.body.indexOf(input.statement)
	return index > 0 ? input.program.body[index - 1] : undefined
}

function statementDeclaration(statement: ESTree.Statement | ESTree.ModuleDeclaration) {
	return statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
}

function matchingSchemaType(input: {
	readonly statement: ESTree.Statement | ESTree.ModuleDeclaration | undefined
	readonly name: string
}) {
	const declaration = input.statement === undefined ? undefined : statementDeclaration(input.statement)
	return (
		declaration?.type === 'TSTypeAliasDeclaration' &&
		declaration.id.name === input.name &&
		declaration.typeAnnotation.type === 'TSTypeQuery' &&
		declaration.typeAnnotation.exprName.type === 'TSQualifiedName' &&
		declaration.typeAnnotation.exprName.left.type === 'Identifier' &&
		declaration.typeAnnotation.exprName.left.name === input.name &&
		declaration.typeAnnotation.exprName.right.name === 'Type'
	)
}

function isSchemaClassCall(input: {readonly context: Context; readonly node: ESTree.CallExpression}) {
	return (
		input.node.callee.type === 'MemberExpression' &&
		importedMember({context: input.context, importedName: 'Schema', node: input.node.callee}) &&
		(memberName(input.node.callee) === 'Class' || memberName(input.node.callee) === 'TaggedClass')
	)
}

function isDataClassUse(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	if (input.node.type === 'MemberExpression') {
		return (
			importedMember({context: input.context, importedName: 'Data', node: input.node}) &&
			(memberName(input.node) === 'Class' || memberName(input.node) === 'TaggedClass')
		)
	}
	if (input.node.type === 'CallExpression' && input.node.callee.type !== 'Super') {
		return isDataClassUse({context: input.context, node: input.node.callee})
	}
	if (input.node.type === 'TSInstantiationExpression') {
		return isDataClassUse({context: input.context, node: input.node.expression})
	}
	return false
}

function isMatchPattern(input: {readonly context: Context; readonly node: ESTree.ObjectExpression}) {
	return (
		input.node.parent.type === 'CallExpression' &&
		input.node.parent.callee.type === 'MemberExpression' &&
		importedMember({context: input.context, importedName: 'Match', node: input.node.parent.callee}) &&
		(memberName(input.node.parent.callee) === 'when' || memberName(input.node.parent.callee) === 'not')
	)
}

function isSchemaTagObject(input: {readonly context: Context; readonly node: ESTree.ObjectExpression}) {
	return (
		input.node.parent.type === 'CallExpression' &&
		input.node.parent.callee.type === 'MemberExpression' &&
		importedMember({context: input.context, importedName: 'Schema', node: input.node.parent.callee}) &&
		memberName(input.node.parent.callee) === 'Struct'
	)
}

function hasTagProperty(node: ESTree.ObjectExpression) {
	return node.properties.some(
		property =>
			property.type === 'Property' &&
			((property.key.type === 'Identifier' && property.key.name === '_tag') ||
				(property.key.type === 'Literal' && property.key.value === '_tag'))
	)
}

function parameterName(parameter: ESTree.ParamPattern) {
	if (parameter.type === 'Identifier') return parameter.name
	if (parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier') return parameter.left.name
	if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') return parameter.argument.name
	return undefined
}

function rootedInParameter(input: {readonly names: readonly string[]; readonly node: ESTree.Expression}): boolean {
	if (input.node.type === 'Identifier') return input.names.includes(input.node.name)
	if (input.node.type === 'MemberExpression') return rootedInParameter({names: input.names, node: input.node.object})
	if (input.node.type === 'ChainExpression') return rootedInParameter({names: input.names, node: input.node.expression})
	if (
		input.node.type === 'TSAsExpression' ||
		input.node.type === 'TSTypeAssertion' ||
		input.node.type === 'TSNonNullExpression'
	) {
		return rootedInParameter({names: input.names, node: input.node.expression})
	}
	return false
}

function derivedFromParameter(input: {readonly names: readonly string[]; readonly node: ESTree.Expression}): boolean {
	if (rootedInParameter(input)) return true
	if (input.node.type === 'ObjectExpression') {
		return (
			input.node.properties.length > 0 &&
			input.node.properties.every(property => {
				if (property.type === 'SpreadElement') {
					return property.argument.type === 'Identifier' && input.names.includes(property.argument.name)
				}
				if (property.value.type === 'Identifier') return input.names.includes(property.value.name)
				return (
					(property.value.type === 'ObjectExpression' || property.value.type === 'ArrayExpression') &&
					derivedFromParameter({names: input.names, node: property.value})
				)
			})
		)
	}
	if (input.node.type === 'ArrayExpression') {
		return (
			input.node.elements.length > 0 &&
			input.node.elements.every(element => {
				if (element === null) return false
				if (element.type === 'SpreadElement') {
					return element.argument.type === 'Identifier' && input.names.includes(element.argument.name)
				}
				if (element.type === 'Identifier') return input.names.includes(element.name)
				return (
					(element.type === 'ObjectExpression' || element.type === 'ArrayExpression') &&
					derivedFromParameter({names: input.names, node: element})
				)
			})
		)
	}
	return false
}

function forwardedCall(input: {
	readonly names: readonly string[]
	readonly node: ESTree.CallExpression | ESTree.NewExpression
}) {
	if (
		input.node.callee.type === 'MemberExpression' &&
		input.node.callee.object.type === 'Literal' &&
		input.node.callee.object.regex !== undefined
	) {
		return false
	}
	return (
		input.node.arguments.length > 0 &&
		input.node.arguments.every(argument => {
			if (argument.type === 'SpreadElement') {
				return argument.argument.type === 'Identifier' && input.names.includes(argument.argument.name)
			}
			if (argument.type === 'Identifier') return input.names.includes(argument.name)
			return (
				(argument.type === 'ObjectExpression' || argument.type === 'ArrayExpression') &&
				derivedFromParameter({names: input.names, node: argument})
			)
		})
	)
}

function returnedExpression(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.body.type === 'BlockStatement') {
		if (node.body.body.length !== 1 || node.body.body[0]?.type !== 'ReturnStatement') return node.body
		return node.body.body[0].argument?.type === 'YieldExpression'
			? node.body.body[0].argument.argument
			: node.body.body[0].argument
	}
	return node.body.type === 'YieldExpression' ? node.body.argument : node.body
}

function isPassThrough(input: {
	readonly context: Context
	readonly node: ESTree.Function | ESTree.ArrowFunctionExpression
}) {
	const names = input.node.params.map(parameterName).filter(name => name !== undefined)
	const returned = returnedExpression(input.node)
	if (names.length === 0) return false
	if (returned === null || returned.type === 'BlockStatement') return false
	if (rootedInParameter({names, node: returned})) return true
	if (returned.type === 'CallExpression') {
		return forwardedCall({names, node: returned})
	}
	if (returned.type === 'NewExpression') {
		return (
			forwardedCall({names, node: returned}) ||
			(returned.callee.type === 'Identifier' &&
				returned.callee.name === 'Error' &&
				input.context.sourceCode.isGlobalReference(returned.callee))
		)
	}
	if (returned.type === 'ObjectExpression' || returned.type === 'ArrayExpression') {
		return derivedFromParameter({names, node: returned})
	}
	return false
}

function serviceClassExpression(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	if (input.node.type === 'CallExpression' && input.node.callee.type !== 'Super') {
		return serviceClassExpression({context: input.context, node: input.node.callee})
	}
	if (input.node.type === 'TSInstantiationExpression') {
		return serviceClassExpression({context: input.context, node: input.node.expression})
	}
	return (
		input.node.type === 'MemberExpression' &&
		((importedMember({context: input.context, importedName: 'Context', node: input.node}) &&
			(memberName(input.node) === 'Service' || memberName(input.node) === 'Tag')) ||
			(importedMember({context: input.context, importedName: 'Effect', node: input.node}) &&
				(memberName(input.node) === 'Service' || memberName(input.node) === 'Tag')))
	)
}

function literalSpanArgument(input: {readonly index?: number; readonly node: ESTree.CallExpression}) {
	return (
		input.node.arguments[input.index ?? 0]?.type === 'Literal' &&
		typeof input.node.arguments[input.index ?? 0].value === 'string'
	)
}

function isSpanCall(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	return (
		importedMemberCall({context: input.context, importedName: 'Effect', node: input.node, propertyName: 'withSpan'}) ||
		importedMemberCall({context: input.context, importedName: 'Stream', node: input.node, propertyName: 'withSpan'})
	)
}

function isEffectFnFactory(input: {readonly context: Context; readonly node: ESTree.Expression}) {
	return (
		importedMemberCall({context: input.context, importedName: 'Effect', node: input.node, propertyName: 'fn'}) ||
		importedMemberCall({context: input.context, importedName: 'Effect', node: input.node, propertyName: 'fnUntraced'})
	)
}

function resolvedInitializer(input: {readonly context: Context; readonly node: ESTree.IdentifierReference}) {
	const variable = variableFromScope({name: input.node.name, scope: input.context.sourceCode.getScope(input.node)})
	for (const definition of variable?.defs ?? []) {
		if (definition.node.type === 'VariableDeclarator' && definition.node.init !== null) return definition.node.init
	}
	return undefined
}

function isServiceIdentifier(input: {readonly context: Context; readonly node: ESTree.IdentifierReference}) {
	const variable = variableFromScope({name: input.node.name, scope: input.context.sourceCode.getScope(input.node)})
	return (
		variable?.defs.some(definition => {
			if (definition.type === 'ImportBinding') {
				return (
					definition.parent?.type === 'ImportDeclaration' &&
					!/(?:^|[/.-])contracts?(?:[/.-]|$)/u.test(definition.parent.source.value)
				)
			}
			if (definition.node.type === 'ClassDeclaration' && definition.node.superClass !== null) {
				return serviceClassExpression({context: input.context, node: definition.node.superClass})
			}
			return (
				definition.node.type === 'VariableDeclarator' &&
				definition.node.init !== null &&
				serviceClassExpression({context: input.context, node: definition.node.init})
			)
		}) === true
	)
}

function effectfulExpression(input: {readonly context: Context; readonly node: ESTree.Expression}): boolean {
	if (
		expressionUsesImport({context: input.context, importedName: 'Effect', node: input.node}) ||
		expressionUsesImport({context: input.context, importedName: 'Stream', node: input.node})
	) {
		return true
	}
	if (input.node.type === 'Identifier') {
		const initializer = resolvedInitializer({context: input.context, node: input.node})
		return initializer !== undefined && effectfulExpression({context: input.context, node: initializer})
	}
	if (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'pipe', node: input.node.callee, source: 'effect'})
	) {
		return input.node.arguments.some(
			argument => argument.type !== 'SpreadElement' && effectfulExpression({context: input.context, node: argument})
		)
	}
	if (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'MemberExpression' &&
		memberName(input.node.callee) === 'pipe'
	) {
		return effectfulExpression({context: input.context, node: input.node.callee.object})
	}
	if (isFunction(input.node)) {
		if (input.node.body.type !== 'BlockStatement') {
			return effectfulExpression({context: input.context, node: input.node.body})
		}
		return input.node.body.body.some(
			statement =>
				statement.type === 'ReturnStatement' &&
				statement.argument !== null &&
				effectfulExpression({context: input.context, node: statement.argument})
		)
	}
	return false
}

function tracedExpression(input: {readonly context: Context; readonly node: ESTree.Expression}): boolean {
	if (input.node.type === 'ArrowFunctionExpression' || input.node.type === 'FunctionExpression') {
		const returned = returnedExpression(input.node)
		return (
			returned !== null &&
			returned.type !== 'BlockStatement' &&
			tracedExpression({context: input.context, node: returned})
		)
	}
	if (input.node.type === 'Identifier') {
		const initializer = resolvedInitializer({context: input.context, node: input.node})
		return initializer !== undefined && tracedExpression({context: input.context, node: initializer})
	}
	if (input.node.type !== 'CallExpression') return false
	if (isEffectFnFactory({context: input.context, node: input.node}) && literalSpanArgument({node: input.node})) {
		return true
	}
	if (
		isSpanCall({context: input.context, node: input.node}) &&
		(literalSpanArgument({node: input.node}) || literalSpanArgument({index: 1, node: input.node}))
	) {
		return true
	}
	if (
		input.node.callee.type === 'CallExpression' &&
		((isEffectFnFactory({context: input.context, node: input.node.callee}) &&
			literalSpanArgument({node: input.node.callee})) ||
			(isSpanCall({context: input.context, node: input.node.callee}) && literalSpanArgument({node: input.node.callee})))
	) {
		return true
	}
	if (input.node.callee.type === 'MemberExpression' && memberName(input.node.callee) === 'pipe') {
		return input.node.arguments.some(
			argument =>
				argument.type !== 'SpreadElement' &&
				argument.type === 'CallExpression' &&
				isSpanCall({context: input.context, node: argument}) &&
				literalSpanArgument({node: argument})
		)
	}
	if (
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'pipe', node: input.node.callee, source: 'effect'})
	) {
		return input.node.arguments.some(
			argument => argument.type !== 'SpreadElement' && tracedExpression({context: input.context, node: argument})
		)
	}
	return false
}

function reportServiceObject(input: {readonly context: Context; readonly node: ESTree.ObjectExpression}) {
	for (const property of input.node.properties) {
		if (
			property.type === 'Property' &&
			property.kind === 'init' &&
			effectfulExpression({context: input.context, node: property.value}) &&
			!tracedExpression({context: input.context, node: property.value})
		) {
			input.context.report({message: 'Trace every direct service Effect or Stream capability.', node: property})
		}
	}
}

function returnedServiceObject(node: ESTree.Expression) {
	if (node.type !== 'CallExpression') return undefined
	for (const argument of node.arguments) {
		if (argument.type === 'SpreadElement' || !isFunction(argument) || argument.body.type !== 'BlockStatement') continue
		for (const statement of argument.body.body) {
			if (statement.type === 'ReturnStatement' && statement.argument?.type === 'ObjectExpression') {
				return statement.argument
			}
		}
	}
	return undefined
}

function serviceMakeObject(node: ESTree.Expression): ESTree.ObjectExpression | undefined {
	if (node.type !== 'CallExpression') return undefined
	for (const argument of node.arguments) {
		if (argument.type !== 'ObjectExpression') continue
		for (const property of argument.properties) {
			if (
				property.type === 'Property' &&
				((property.key.type === 'Identifier' && property.key.name === 'make') ||
					(property.key.type === 'Literal' && property.key.value === 'make'))
			) {
				const returned = returnedServiceObject(property.value)
				if (returned !== undefined) return returned
			}
		}
	}
	return node.callee.type === 'Super' ? undefined : serviceMakeObject(node.callee)
}

function isReactLocalCollection(node: ESTree.NewExpression) {
	if (node.parent.type !== 'ArrowFunctionExpression') return false
	if (node.parent.parent.type !== 'CallExpression' || node.parent.parent.callee.type !== 'Identifier') return false
	return node.parent.parent.callee.name === 'useState' || node.parent.parent.callee.name === 'useRef'
}

function isFakeRefState(input: {readonly context: Context; readonly node: ESTree.CallExpression}) {
	if (
		input.node.callee.type !== 'Identifier' ||
		!isImportBinding({context: input.context, importedName: 'useState', node: input.node.callee, source: 'react'}) ||
		input.node.arguments[0]?.type !== 'ArrowFunctionExpression' ||
		input.node.arguments[0].body.type !== 'ObjectExpression'
	) {
		return false
	}
	return input.node.arguments[0].body.properties.some(
		property =>
			property.type === 'Property' &&
			((property.key.type === 'Identifier' && property.key.name === 'current') ||
				(property.key.type === 'Literal' && property.key.value === 'current'))
	)
}

const plugin = definePlugin({
	meta: {name: '@deslop/oxlint-rules'},
	rules: {
		'inline-schema-operation': {
			create: context => ({
				CallExpression: node => {
					if (isSchemaCompilerCall({context, node}) && !isInlineSchemaCompiler({context, node})) {
						context.report({message: 'Invoke Schema encoding and decoding operations inline.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'module-scope-definition': {
			create: context => ({
				ClassDeclaration: node => {
					if (
						node.parent.type !== 'Program' &&
						node.parent.type !== 'ExportNamedDeclaration' &&
						node.superClass !== null &&
						serviceClassExpression({context, node: node.superClass})
					) {
						context.report({message: 'Keep service definitions at module scope.', node})
					}
				},
				Property: node => {
					if (
						node.value.type !== 'AssignmentPattern' &&
						!expressionAtModuleScope(node) &&
						!referencesFunctionParameter({context, node: node.value}) &&
						!(
							node.parent.type === 'ObjectExpression' &&
							node.parent.parent.type === 'CallExpression' &&
							isSchemaDefinition({context, node: node.parent.parent})
						) &&
						definitionExpression({context, node: node.value})
					) {
						context.report({message: 'Keep reusable definitions at module scope.', node})
					}
				},
				PropertyDefinition: node => {
					if (
						!node.static &&
						node.value !== null &&
						!referencesFunctionParameter({context, node: node.value}) &&
						definitionExpression({context, node: node.value})
					) {
						context.report({message: 'Keep reusable definitions at module scope.', node})
					}
				},
				ReturnStatement: node => {
					if (
						node.argument !== null &&
						!referencesFunctionParameter({context, node: node.argument}) &&
						definitionExpression({context, node: node.argument})
					) {
						context.report({message: 'Keep reusable definitions at module scope.', node})
					}
				},
				VariableDeclarator: node => {
					if (
						node.init !== null &&
						!declaredAtModuleScope(node) &&
						!referencesFunctionParameter({context, node: node.init}) &&
						definitionExpression({context, node: node.init})
					) {
						context.report({message: 'Keep schemas and service definitions at module scope.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-access-alias': {
			create: context => ({
				ImportSpecifier: node => {
					if (node.imported.type === 'Identifier' && node.imported.name !== node.local.name) {
						context.report({message: 'Use imported names directly.', node})
					}
				},
				VariableDeclarator: node => {
					if (
						node.id.type === 'Identifier' &&
						node.init !== null &&
						!isSchemaDefinition({context, node: node.init}) &&
						isAccessAlias(node.init)
					) {
						context.report({message: 'Inline access aliases.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-composed-identity-key': {
			create: context => ({
				ExportNamedDeclaration: node => {
					if (node.declaration?.type !== 'VariableDeclaration') return
					for (const declaration of node.declaration.declarations) {
						if (declaration.init?.type === 'TemplateLiteral' || declaration.init?.type === 'BinaryExpression') {
							context.report({message: 'Use structured identity instead of composed exported keys.', node: declaration})
						}
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-data-class': {
			create: context => ({
				CallExpression: node => {
					if (isDataClassUse({context, node})) {
						context.report({message: 'Use schema-backed structural data.', node})
					}
				},
				ClassDeclaration: node => {
					if (node.superClass !== null && isDataClassUse({context, node: node.superClass})) {
						context.report({message: 'Use schema-backed structural data.', node})
					}
				},
				ClassExpression: node => {
					if (node.superClass !== null && isDataClassUse({context, node: node.superClass})) {
						context.report({message: 'Use schema-backed structural data.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-effect-run-entrypoint': {
			create: context => ({
				CallExpression: node => {
					if (
						node.callee.type === 'MemberExpression' &&
						importedMember({context, importedName: 'Effect', node: node.callee}) &&
						memberName(node.callee)?.startsWith('run') === true
					) {
						context.report({message: 'Do not run Effects directly.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-fake-ref-state': {
			create: context => ({
				CallExpression: node => {
					if (isFakeRefState({context, node})) {
						context.report({message: 'Use useRef or direct state instead of fake ref state.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-manual-tag': {
			create: context => ({
				MemberExpression: node => {
					if (memberName(node) === '_tag') {
						context.report({message: 'Handle tags through Effect helpers.', node})
					}
				},
				ObjectExpression: node => {
					if (hasTagProperty(node) && !isMatchPattern({context, node}) && !isSchemaTagObject({context, node})) {
						context.report({message: 'Construct tagged values through Effect schemas and helpers.', node})
					}
				},
				Property: node => {
					if (
						node.parent.type === 'ObjectPattern' &&
						((node.key.type === 'Identifier' && node.key.name === '_tag') ||
							(node.key.type === 'Literal' && node.key.value === '_tag'))
					) {
						context.report({message: 'Handle tags through Effect helpers.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-method-pipe': {
			create: context => ({
				CallExpression: node => {
					if (node.callee.type === 'MemberExpression' && memberName(node.callee) === 'pipe') {
						context.report({message: 'Use the pipe or flow function instead of method-style pipe.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-multiline-ternary-initializer': {
			create: context => ({
				ConditionalExpression: node => {
					if (
						node.parent.type === 'VariableDeclarator' &&
						node.parent.init === node &&
						node.loc.start.line !== node.loc.end.line
					) {
						context.report({message: 'Use Match or control flow for multiline value selection.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-native-mutable-collection': {
			create: context => ({
				NewExpression: node => {
					if (
						node.callee.type === 'Identifier' &&
						['Map', 'Set', 'WeakMap', 'WeakSet'].includes(node.callee.name) &&
						context.sourceCode.isGlobalReference(node.callee) &&
						!isReactLocalCollection(node)
					) {
						context.report({message: 'Use Effect collections or an owned Effect state primitive.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-nullary-effect-fn': {
			create: context => ({
				CallExpression: node => {
					if (
						node.arguments[0] !== undefined &&
						node.arguments[0].type !== 'SpreadElement' &&
						isFunction(node.arguments[0]) &&
						node.arguments[0].params.length === 0 &&
						(isEffectFnFactory({context, node}) ||
							(node.callee.type === 'CallExpression' && isEffectFnFactory({context, node: node.callee})))
					) {
						context.report({message: 'Use an Effect.gen value for nullary work.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-pass-through-wrapper': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (
						!isRuleCallback(node) &&
						!isContextualObjectCallback(node) &&
						(node.parent.type === 'VariableDeclarator' ||
							node.parent.type === 'Property' ||
							isEffectFnCallback({context, node})) &&
						isPassThrough({context, node})
					) {
						context.report({message: 'Inline pass-through wrappers.', node})
					}
				},
				FunctionDeclaration: node => {
					if (isPassThrough({context, node})) context.report({message: 'Inline pass-through wrappers.', node})
				},
				FunctionExpression: node => {
					if (
						!isRuleCallback(node) &&
						!isContextualObjectCallback(node) &&
						(node.parent.type === 'VariableDeclarator' ||
							node.parent.type === 'Property' ||
							(node.parent.type === 'MethodDefinition' && node.parent.override !== true) ||
							isEffectFnCallback({context, node})) &&
						isPassThrough({context, node})
					) {
						context.report({message: 'Inline pass-through wrappers.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-private-workspace-import': {
			create: context => ({
				ImportDeclaration: node => {
					if (
						/^@deslop\/[^/]+\/(?:src|lib)(?:\/|$)/u.test(node.source.value) ||
						/^(?:\.\.\/)+[^/]+\/(?:src|lib)(?:\/|$)/u.test(node.source.value)
					) {
						context.report({message: 'Use public workspace package exports.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-schema-class': {
			create: context => ({
				CallExpression: node => {
					if (isSchemaClassCall({context, node})) {
						context.report({message: 'Use Schema.Struct or Schema.TaggedStruct.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'schema-type-pair': {
			createOnce: context => ({
				Program: program => {
					for (const statement of program.body) {
						const declaration = statementDeclaration(statement)
						if (declaration?.type !== 'VariableDeclaration') continue
						for (const variable of declaration.declarations) {
							if (
								variable.id.type === 'Identifier' &&
								/^[A-Z]/u.test(variable.id.name) &&
								variable.init !== null &&
								isSchemaDefinition({context, node: variable.init}) &&
								!matchingSchemaType({name: variable.id.name, statement: previousStatement({program, statement})})
							) {
								context.report({
									message: 'Place the matching schema type immediately before the schema value.',
									node: variable
								})
							}
						}
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'service-capability-tracing': {
			create: context => ({
				CallExpression: node => {
					if (
						node.callee.type !== 'MemberExpression' ||
						node.callee.object.type !== 'Identifier' ||
						!isServiceIdentifier({context, node: node.callee.object}) ||
						memberName(node.callee) !== 'of' ||
						node.arguments[0]?.type !== 'ObjectExpression'
					) {
						return
					}
					reportServiceObject({context, node: node.arguments[0]})
				},
				ClassDeclaration: node => {
					if (node.superClass !== null && serviceClassExpression({context, node: node.superClass})) {
						const serviceObject = serviceMakeObject(node.superClass)
						if (serviceObject !== undefined) reportServiceObject({context, node: serviceObject})
					}
				}
			}),
			meta: {type: 'problem'}
		}
	}
})

export default plugin
