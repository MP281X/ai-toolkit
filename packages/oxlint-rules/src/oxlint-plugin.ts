// Oxlint rules are synchronous; the manifest rule must read its repository boundary before reporting.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import {readFileSync, readdirSync} from 'node:fs'

import {Array, HashSet, Option, Record, Schema, String, pipe} from 'effect'

import {definePlugin} from '@oxlint/plugins'
import type {Context, ESTree, Scope, Variable} from '@oxlint/plugins'

type PackageManifest = typeof PackageManifest.Type
const PackageManifest = Schema.fromJsonString(
	Schema.Struct({
		dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String))
	})
)

function dependencyNames(manifest: PackageManifest) {
	return pipe(
		[
			manifest.dependencies ?? {},
			manifest.devDependencies ?? {},
			manifest.optionalDependencies ?? {},
			manifest.peerDependencies ?? {}
		],
		Array.flatMap(Record.keys)
	)
}

function duplicateRootDependencies() {
	const root = new URL('../../../', import.meta.url)
	const rootDependencies = pipe(
		Schema.decodeSync(PackageManifest)(readFileSync(new URL('package.json', root), 'utf8')),
		dependencyNames,
		HashSet.fromIterable
	)
	return pipe(
		['apps', 'packages'],
		Array.flatMap(directory =>
			Array.map(readdirSync(new URL(`${directory}/`, root)), name => ({
				manifest: Schema.decodeSync(PackageManifest)(
					readFileSync(new URL(`${directory}/${name}/package.json`, root), 'utf8')
				),
				path: `${directory}/${name}/package.json`
			}))
		),
		Array.flatMap(input =>
			pipe(
				dependencyNames(input.manifest),
				Array.filter(name => HashSet.has(rootDependencies, name)),
				Array.map(name => ({name, path: input.path}))
			)
		)
	)
}

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
		Option.exists(name => /^(?:decode|encode)(?:Unknown)?(?:Effect|Exit|Option|Promise|Result|Sync)$/u.test(name))
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

function parameterName(parameter: ESTree.ParamPattern) {
	if (parameter.type === 'Identifier') return Option.some(parameter.name)
	if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') {
		return Option.some(parameter.argument.name)
	}
	return Option.none()
}

function forwardedCall(input: {names: string[]; node: ESTree.CallExpression | ESTree.NewExpression}) {
	return (
		input.node.arguments.length === input.names.length &&
		Array.every(input.node.arguments, (argument, index) => {
			const name = input.names[index]
			if (argument.type === 'SpreadElement') {
				return argument.argument.type === 'Identifier' && argument.argument.name === name
			}
			return argument.type === 'Identifier' && argument.name === name
		})
	)
}

function returnedExpression(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.body === null) return
	if (node.body.type !== 'BlockStatement') return node.body
	if (node.body.body.length !== 1 || node.body.body[0]?.type !== 'ReturnStatement') return
	return node.body.body[0].argument
}

function hasSingleStatementExpression(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.body === null) return false
	if (node.body.type !== 'BlockStatement') return true
	if (node.body.body.length !== 1) return false
	const statement = node.body.body[0]
	return (
		statement?.type === 'ExpressionStatement' || (statement?.type === 'ReturnStatement' && statement.argument !== null)
	)
}

function exactForwardingFunction(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const names = pipe(node.params, Array.map(parameterName), Array.getSomes)
	const returned = returnedExpression(node)
	if (names.length === 0 || names.length !== node.params.length || returned === null || returned === undefined) {
		return false
	}
	if (returned.type === 'Identifier') return names.length === 1 && returned.name === names[0]
	return (
		(returned.type === 'CallExpression' || returned.type === 'NewExpression') &&
		returned.callee.type === 'Identifier' &&
		forwardedCall({names, node: returned})
	)
}

function singleUseThunk(input: {context: Context; node: ESTree.Function | ESTree.ArrowFunctionExpression}) {
	if (
		input.node.params.length !== 0 ||
		input.node.typeParameters !== null ||
		!hasSingleStatementExpression(input.node)
	) {
		return false
	}
	let name = ''
	if (input.node.type === 'FunctionDeclaration') {
		name = input.node.id?.name ?? ''
	} else if (input.node.parent.type === 'VariableDeclarator' && input.node.parent.id.type === 'Identifier') {
		name = input.node.parent.id.name
	}
	if (String.isEmpty(name)) return false
	return pipe(
		variableFromScope({name, scope: input.context.sourceCode.getScope(input.node)}),
		Option.exists(variable => Array.filter(variable.references, reference => reference.isRead()).length === 1)
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
		'no-duplicate-root-dependency': {
			createOnce: context => ({
				Program: program => {
					if (!String.endsWith('/vite.config.ts')(context.filename)) return
					for (const duplicate of duplicateRootDependencies()) {
						context.report({message: `${duplicate.path} redeclares root dependency ${duplicate.name}.`, node: program})
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
						(node.parent.type === 'VariableDeclarator' || node.parent.type === 'Property') &&
						(exactForwardingFunction(node) || singleUseThunk({context, node}))
					) {
						context.report({message: 'Inline this function at its only use site.', node})
					}
				},
				FunctionDeclaration: node => {
					if (exactForwardingFunction(node) || singleUseThunk({context, node})) {
						context.report({message: 'Inline this function at its only use site.', node})
					}
				},
				FunctionExpression: node => {
					if (
						(node.parent.type === 'VariableDeclarator' ||
							node.parent.type === 'Property' ||
							(node.parent.type === 'MethodDefinition' && node.parent.override !== true)) &&
						(exactForwardingFunction(node) || singleUseThunk({context, node}))
					) {
						context.report({message: 'Inline this function at its only use site.', node})
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
											message: `Place \`type ${variable.id.name} = typeof ${variable.id.name}.Type\` immediately before this Schema.`,
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
