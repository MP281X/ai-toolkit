import {Array, Option, String, pipe} from 'effect'

import {definePlugin} from '@oxlint/plugins'
import type {Context, ESTree, Scope, Variable} from '@oxlint/plugins'

function variableFromScope(input: {name: string; scope: Scope | null}): Option.Option<Variable> {
	if (input.scope === null) return Option.none()
	const scope = input.scope
	return pipe(
		Option.fromNullishOr(scope.set.get(input.name)),
		Option.orElse(() => variableFromScope({name: input.name, scope: scope.upper}))
	)
}

function variableFor(context: Context, node: ESTree.IdentifierReference) {
	return variableFromScope({name: node.name, scope: context.sourceCode.getScope(node)})
}

function importSource(variable: ReturnType<typeof variableFor>) {
	return pipe(
		variable,
		Option.flatMap(resolvedVariable =>
			Array.findFirst(
				resolvedVariable.defs,
				definition => definition.type === 'ImportBinding' && definition.parent?.type === 'ImportDeclaration'
			)
		),
		Option.map(definition =>
			definition.type === 'ImportBinding' && definition.parent?.type === 'ImportDeclaration'
				? definition.parent.source.value
				: ''
		)
	)
}

function isImportBinding(input: {
	context: Context
	importedName: string
	node: ESTree.IdentifierReference
	source: string | RegExp
}) {
	return pipe(
		variableFor(input.context, input.node),
		Option.exists(variable =>
			Array.some(variable.defs, definition => {
				if (definition.type !== 'ImportBinding' || definition.parent?.type !== 'ImportDeclaration') return false
				const source = definition.parent.source.value
				if (typeof input.source === 'string' ? source !== input.source : !input.source.test(source)) return false
				return (
					definition.node.type === 'ImportSpecifier' &&
					definition.node.imported.type === 'Identifier' &&
					definition.node.imported.name === input.importedName
				)
			})
		)
	)
}

function isNamespaceImport(input: {context: Context; node: ESTree.IdentifierReference; source: string}) {
	return pipe(
		variableFor(input.context, input.node),
		Option.exists(variable =>
			Array.some(
				variable.defs,
				definition =>
					definition.type === 'ImportBinding' &&
					definition.node.type === 'ImportNamespaceSpecifier' &&
					definition.parent?.type === 'ImportDeclaration' &&
					definition.parent.source.value === input.source
			)
		)
	)
}

function memberName(node: ESTree.MemberExpression) {
	if (!node.computed && node.property.type === 'Identifier') return Option.some(node.property.name)
	if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
		return Option.some(node.property.value)
	}
	return Option.none()
}

function importedMember(input: {
	context: Context
	importedName: string
	node: ESTree.Expression
	propertyName?: string
}): input is {context: Context; importedName: string; node: ESTree.MemberExpression; propertyName?: string} {
	return (
		input.node.type === 'MemberExpression' &&
		input.node.object.type === 'Identifier' &&
		isImportBinding({
			context: input.context,
			importedName: input.importedName,
			node: input.node.object,
			source: 'effect'
		}) &&
		(input.propertyName === undefined || Option.contains(memberName(input.node), input.propertyName))
	)
}

function expressionRoot(node: ESTree.Expression): ESTree.Expression {
	if (node.type === 'MemberExpression') return expressionRoot(node.object)
	if (node.type === 'CallExpression' && node.callee.type !== 'Super') return expressionRoot(node.callee)
	if (node.type === 'ChainExpression') return expressionRoot(node.expression)
	if (node.type === 'TSInstantiationExpression') return expressionRoot(node.expression)
	if (node.type === 'TSSatisfiesExpression') return expressionRoot(node.expression)
	return node
}

function expressionUsesImport(input: {context: Context; importedName: string; node: ESTree.Expression}) {
	const root = expressionRoot(input.node)
	return (
		root.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: input.importedName, node: root, source: 'effect'})
	)
}

function schemaDefinitionMember(node: ESTree.Expression): Option.Option<ESTree.MemberExpression> {
	if (node.type === 'CallExpression' && node.callee.type !== 'Super') return schemaDefinitionMember(node.callee)
	if (node.type === 'TSInstantiationExpression') return schemaDefinitionMember(node.expression)
	if (node.type === 'TSSatisfiesExpression') return schemaDefinitionMember(node.expression)
	if (node.type === 'MemberExpression' && Option.contains(memberName(node), 'pipe')) {
		return schemaDefinitionMember(node.object)
	}
	return node.type === 'MemberExpression' ? Option.some(node) : Option.none()
}

function isSchemaDefinition(input: {context: Context; node: ESTree.Expression}): boolean {
	if (
		input.node.type === 'CallExpression' &&
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'pipe', node: input.node.callee, source: 'effect'}) &&
		input.node.arguments[0] !== undefined &&
		input.node.arguments[0].type !== 'SpreadElement'
	) {
		return isSchemaDefinition({context: input.context, node: input.node.arguments[0]})
	}
	if (input.node.type === 'TSSatisfiesExpression') {
		return isSchemaDefinition({context: input.context, node: input.node.expression})
	}
	if (!expressionUsesImport({context: input.context, importedName: 'Schema', node: input.node})) return false
	return pipe(
		schemaDefinitionMember(input.node),
		Option.exists(member => {
			if (!importedMember({context: input.context, importedName: 'Schema', node: member})) return false
			return pipe(
				memberName(member),
				Option.match({
					onNone: () => true,
					onSome: name => !String.startsWith('decode')(name) && !String.startsWith('encode')(name)
				})
			)
		})
	)
}

function isSchemaCompilerCall(input: {context: Context; node: ESTree.CallExpression}) {
	if (
		input.node.callee.type !== 'MemberExpression' ||
		!importedMember({context: input.context, importedName: 'Schema', node: input.node.callee})
	) {
		return false
	}
	return pipe(
		memberName(input.node.callee),
		Option.exists(name => String.startsWith('decode')(name) || String.startsWith('encode')(name))
	)
}

function isInlineSchemaCompiler(input: {context: Context; node: ESTree.CallExpression}) {
	if (input.node.parent.type !== 'CallExpression') return false
	if (input.node.parent.callee === input.node) return true
	return (
		input.node.parent.callee.type === 'MemberExpression' &&
		(importedMember({context: input.context, importedName: 'Effect', node: input.node.parent.callee}) ||
			importedMember({context: input.context, importedName: 'Stream', node: input.node.parent.callee}))
	)
}

function statementDeclaration(statement: ESTree.Statement | ESTree.ModuleDeclaration) {
	return statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
}

function previousStatement(input: {program: ESTree.Program; statement: ESTree.Statement}) {
	return pipe(
		input.program.body,
		Array.findFirstIndex(statement => statement === input.statement),
		Option.filter(index => index > 0),
		Option.flatMap(index => Array.get(input.program.body, index - 1))
	)
}

function matchingSchemaType(input: {
	name: string
	typeStatement: Option.Option<ESTree.Statement | ESTree.ModuleDeclaration>
}) {
	return pipe(
		input.typeStatement,
		Option.exists(typeStatement => {
			const declaration = statementDeclaration(typeStatement)
			return (
				declaration?.type === 'TSTypeAliasDeclaration' &&
				declaration.id.name === input.name &&
				declaration.typeAnnotation.type === 'TSTypeQuery' &&
				declaration.typeAnnotation.exprName.type === 'TSQualifiedName' &&
				declaration.typeAnnotation.exprName.left.type === 'Identifier' &&
				declaration.typeAnnotation.exprName.left.name === input.name &&
				declaration.typeAnnotation.exprName.right.name === 'Type'
			)
		})
	)
}

function schemaSchemaType(input: {context: Context; node: ESTree.TSType}) {
	return (
		input.node.type === 'TSTypeReference' &&
		input.node.typeName.type === 'TSQualifiedName' &&
		input.node.typeName.left.type === 'Identifier' &&
		input.node.typeName.left.name === 'Schema' &&
		input.node.typeName.right.name === 'Schema' &&
		isImportBinding({context: input.context, importedName: 'Schema', node: input.node.typeName.left, source: 'effect'})
	)
}

function propertyName(node: ESTree.ObjectProperty) {
	if (!node.computed && node.key.type === 'Identifier') return Option.some(node.key.name)
	if (node.key.type === 'Literal' && typeof node.key.value === 'string') return Option.some(node.key.value)
	return Option.none()
}

function isRuleOrContextCallback(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.parent.type !== 'Property') return false
	if (
		(!node.parent.computed &&
			node.parent.key.type === 'Identifier' &&
			(node.parent.key.name === 'create' || node.parent.key.name === 'createOnce')) ||
		(node.parent.key.type === 'Literal' &&
			(node.parent.key.value === 'create' || node.parent.key.value === 'createOnce'))
	) {
		return true
	}
	return node.parent.parent.type === 'ObjectExpression' && node.parent.parent.parent.type === 'CallExpression'
}

function parameterName(parameter: ESTree.ParamPattern) {
	if (parameter.type === 'Identifier') return Option.some(parameter.name)
	if (parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier') {
		return Option.some(parameter.left.name)
	}
	if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') {
		return Option.some(parameter.argument.name)
	}
	return Option.none()
}

function forwardedCall(input: {names: string[]; node: ESTree.CallExpression | ESTree.NewExpression}) {
	return (
		input.node.arguments.length > 0 &&
		Array.every(input.node.arguments, argument => {
			if (argument.type === 'SpreadElement') {
				return argument.argument.type === 'Identifier' && Array.contains(input.names, argument.argument.name)
			}
			return argument.type === 'Identifier' && Array.contains(input.names, argument.name)
		})
	)
}

function returnedExpression(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.body === null) return
	if (node.body.type !== 'BlockStatement') return node.body
	if (node.body.body.length !== 1 || node.body.body[0]?.type !== 'ReturnStatement') return
	return node.body.body[0].argument
}

function exactForwardingFunction(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const names = pipe(node.params, Array.map(parameterName), Array.getSomes)
	const returned = returnedExpression(node)
	if (names.length === 0 || returned === null || returned === undefined) return false
	if (returned.type === 'Identifier' && Array.contains(names, returned.name)) return true
	return (
		(returned.type === 'CallExpression' || returned.type === 'NewExpression') &&
		returned.callee.type === 'Identifier' &&
		forwardedCall({names, node: returned})
	)
}

function immutableSource(context: Context, node: ESTree.IdentifierReference) {
	return pipe(
		variableFor(context, node),
		Option.exists(variable => {
			if (Array.some(variable.references, reference => reference.isWrite() && !reference.init)) return false
			return Array.some(variable.defs, definition => {
				if (definition.type === 'ImportBinding' || definition.type === 'Parameter') return true
				return (
					definition.node.type === 'VariableDeclarator' &&
					definition.node.parent.type === 'VariableDeclaration' &&
					definition.node.parent.kind === 'const'
				)
			})
		})
	)
}

function redundantConstAlias(input: {context: Context; node: ESTree.VariableDeclarator}) {
	if (
		input.node.parent.type !== 'VariableDeclaration' ||
		input.node.parent.kind !== 'const' ||
		input.node.id.type !== 'Identifier' ||
		input.node.id.typeAnnotation !== null ||
		input.node.init?.type !== 'Identifier' ||
		!immutableSource(input.context, input.node.init)
	) {
		return false
	}
	return pipe(
		variableFromScope({name: input.node.id.name, scope: input.context.sourceCode.getScope(input.node)}),
		Option.exists(alias => Array.filter(alias.references, reference => reference.isRead()).length === 1)
	)
}

function isFakeRefState(input: {context: Context; node: ESTree.CallExpression}) {
	if (
		input.node.callee.type !== 'Identifier' ||
		!isImportBinding({context: input.context, importedName: 'useState', node: input.node.callee, source: 'react'}) ||
		input.node.arguments[0]?.type !== 'ArrowFunctionExpression' ||
		input.node.arguments[0].body.type !== 'ObjectExpression'
	) {
		return false
	}
	return Array.some(
		input.node.arguments[0].body.properties,
		property => property.type === 'Property' && Option.contains(propertyName(property), 'current')
	)
}

function isReactUseState(input: {context: Context; node: ESTree.CallExpression}) {
	return (
		input.node.callee.type === 'Identifier' &&
		isImportBinding({context: input.context, importedName: 'useState', node: input.node.callee, source: 'react'})
	)
}

function isReactUseRef(input: {context: Context; node: ESTree.CallExpression}) {
	if (input.node.callee.type === 'Identifier') {
		return isImportBinding({context: input.context, importedName: 'useRef', node: input.node.callee, source: 'react'})
	}
	return (
		input.node.callee.type === 'MemberExpression' &&
		Option.contains(memberName(input.node.callee), 'useRef') &&
		input.node.callee.object.type === 'Identifier' &&
		isNamespaceImport({context: input.context, node: input.node.callee.object, source: 'react'})
	)
}

function redundantUseRefNullType(input: {context: Context; node: ESTree.CallExpression}) {
	const type = input.node.typeArguments?.params[0]
	return (
		isReactUseRef(input) &&
		input.node.arguments[0]?.type === 'Literal' &&
		input.node.arguments[0].value === null &&
		type?.type === 'TSUnionType' &&
		Array.some(type.types, member => member.type === 'TSNullKeyword')
	)
}

function unknownJsonSchema(input: {context: Context; node: ESTree.CallExpression}) {
	if (
		input.node.callee.type !== 'MemberExpression' ||
		!importedMember({
			context: input.context,
			importedName: 'Schema',
			node: input.node.callee,
			propertyName: 'fromJsonString'
		}) ||
		input.node.arguments[0]?.type !== 'MemberExpression' ||
		!importedMember({
			context: input.context,
			importedName: 'Schema',
			node: input.node.arguments[0],
			propertyName: 'Unknown'
		})
	) {
		return false
	}
	const parent = input.node.parent
	if (
		parent.type !== 'CallExpression' ||
		parent.arguments[0] !== input.node ||
		parent.callee.type !== 'MemberExpression'
	) {
		return false
	}
	return (
		importedMember({context: input.context, importedName: 'Schema', node: parent.callee}) &&
		pipe(memberName(parent.callee), Option.exists(String.startsWith('decode')))
	)
}

function directRpcPromise(input: {context: Context; node: ESTree.CallExpression}) {
	const options = input.node.arguments[1]
	if (
		!String.endsWith('.tsx')(input.context.filename) ||
		input.node.callee.type !== 'Identifier' ||
		!isImportBinding({
			context: input.context,
			importedName: 'useAtomSet',
			node: input.node.callee,
			source: '@effect/atom-react'
		}) ||
		input.node.arguments[0]?.type !== 'CallExpression' ||
		input.node.arguments[0].callee.type !== 'MemberExpression' ||
		!Option.contains(memberName(input.node.arguments[0].callee), 'mutation') ||
		input.node.arguments[0].callee.object.type !== 'Identifier' ||
		options?.type !== 'ObjectExpression' ||
		!Array.some(
			options.properties,
			property =>
				property.type === 'Property' &&
				Option.contains(propertyName(property), 'mode') &&
				property.value.type === 'Literal' &&
				property.value.value === 'promise'
		)
	) {
		return false
	}
	return pipe(
		importSource(variableFor(input.context, input.node.arguments[0].callee.object)),
		Option.exists(source => /(?:^|\/)atomRuntime\.ts$/u.test(source))
	)
}

const plugin = definePlugin({
	meta: {name: '@deslop/oxlint-rules'},
	rules: {
		'inline-schema-operation': {
			create: context => ({
				CallExpression: node => {
					if (isSchemaCompilerCall({context, node}) && !isInlineSchemaCompiler({context, node})) {
						context.report({message: 'Invoke this Schema operation at its consumption site.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-direct-rpc-promise-in-component': {
			create: context => ({
				CallExpression: node => {
					if (directRpcPromise({context, node})) {
						context.report({
							message: 'Move this RPC mutation, pending state, and failure policy into an action Atom.',
							node
						})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-fake-ref-state': {
			create: context => ({
				CallExpression: node => {
					if (isFakeRefState({context, node})) {
						context.report({message: 'Use useRef for ref-shaped lifecycle state.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-readonly-type-syntax': {
			create: context => ({
				PropertyDefinition: node => {
					if (node.readonly === true) context.report({message: 'Remove the readonly type modifier.', node})
				},
				TSIndexSignature: node => {
					if (node.readonly) context.report({message: 'Remove the readonly index modifier.', node})
				},
				TSPropertySignature: node => {
					if (node.readonly) context.report({message: 'Remove the readonly property modifier.', node})
				},
				TSTypeOperator: node => {
					if (node.operator === 'readonly') context.report({message: 'Use a mutable type shape.', node})
				}
			}),
			meta: {type: 'problem'}
		},
		'no-redundant-use-ref-null-type': {
			create: context => ({
				CallExpression: node => {
					if (redundantUseRefNullType({context, node})) {
						context.report({
							message: 'Remove null from the explicit useRef type; the null initializer already owns it.',
							node
						})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-trivial-indirection': {
			create: context => ({
				ArrowFunctionExpression: node => {
					if (
						!isRuleOrContextCallback(node) &&
						(node.parent.type === 'VariableDeclarator' || node.parent.type === 'Property') &&
						exactForwardingFunction(node)
					) {
						context.report({message: 'Inline this unchanged forwarding function.', node})
					}
				},
				FunctionDeclaration: node => {
					if (exactForwardingFunction(node)) {
						context.report({message: 'Inline this unchanged forwarding function.', node})
					}
				},
				FunctionExpression: node => {
					if (
						!isRuleOrContextCallback(node) &&
						(node.parent.type === 'VariableDeclarator' ||
							node.parent.type === 'Property' ||
							(node.parent.type === 'MethodDefinition' && node.parent.override !== true)) &&
						exactForwardingFunction(node)
					) {
						context.report({message: 'Inline this unchanged forwarding function.', node})
					}
				},
				VariableDeclarator: node => {
					if (redundantConstAlias({context, node})) {
						context.report({message: 'Use the immutable source binding directly.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-undestructured-use-state': {
			create: context => ({
				VariableDeclarator: node => {
					if (
						node.init?.type === 'CallExpression' &&
						isReactUseState({context, node: node.init}) &&
						node.id.type !== 'ArrayPattern'
					) {
						context.report({message: 'Destructure the state value and setter at the declaration.', node})
					}
				}
			}),
			meta: {type: 'problem'}
		},
		'no-unvalidated-json-decode': {
			create: context => ({
				CallExpression: node => {
					if (unknownJsonSchema({context, node})) {
						context.report({message: 'Decode JSON through its protocol Schema instead of Schema.Unknown.', node})
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
						if (declaration?.type === 'VariableDeclaration') {
							for (const variable of declaration.declarations) {
								if (
									variable.id.type === 'Identifier' &&
									/^[A-Z]/u.test(variable.id.name) &&
									variable.init !== null &&
									isSchemaDefinition({context, node: variable.init})
								) {
									if (
										!matchingSchemaType({
											name: variable.id.name,
											typeStatement: previousStatement({program, statement})
										})
									) {
										context.report({
											message:
												'Place the matching schema type immediately before this schema with the same export visibility.',
											node: variable
										})
									}
									if (
										variable.init.type === 'TSSatisfiesExpression' &&
										schemaSchemaType({context, node: variable.init.typeAnnotation})
									) {
										context.report({
											message: 'Infer this schema instead of restating Schema.Schema.',
											node: variable.init
										})
									}
									const annotation = variable.id.typeAnnotation
									if (
										annotation !== null &&
										annotation !== undefined &&
										schemaSchemaType({context, node: annotation.typeAnnotation})
									) {
										context.report({
											message: 'Infer this schema instead of annotating Schema.Schema.',
											node: variable.id
										})
									}
								}
							}
						}
					}
				}
			}),
			meta: {type: 'problem'}
		}
	}
})

export default plugin
