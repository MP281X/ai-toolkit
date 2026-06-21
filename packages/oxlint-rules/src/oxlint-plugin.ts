import {definePlugin} from '@oxlint/plugins'

export default definePlugin({
	meta: {name: '@deslop/oxlint-rules'},
	rules: {
		'no-access-alias': {
			create: context => ({
				VariableDeclarator: node => {
					if (
						node.id.type === 'Identifier' &&
						node.init !== null &&
						(node.init.type === 'MemberExpression' ||
							(node.init.type === 'ChainExpression' && node.init.expression.type === 'MemberExpression'))
					) {
						context.report({message: 'Inline access alias.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline access alias.'}, type: 'problem'}
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
					if (
						node.id.type === 'Identifier' &&
						node.init !== null &&
						(node.init.type === 'BinaryExpression' ||
							node.init.type === 'LogicalExpression' ||
							node.init.type === 'UnaryExpression' ||
							node.init.type === 'ConditionalExpression')
					) {
						context.report({message: 'Inline condition alias.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline condition alias.'}, type: 'problem'}
		},
		'no-floating-local-type': {
			create: context => ({
				TSInterfaceDeclaration: node => {
					if (node.parent.type !== 'ExportNamedDeclaration' && node.parent.type !== 'ExportDefaultDeclaration') {
						context.report({message: 'Inline type.', node})
					}
				},
				TSTypeAliasDeclaration: node => {
					if (node.parent.type !== 'ExportNamedDeclaration' && node.parent.type !== 'ExportDefaultDeclaration') {
						context.report({message: 'Inline type.', node})
					}
				}
			}),
			meta: {messages: {default: 'Inline type.'}, type: 'problem'}
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
		'no-object-destructure': {
			create: context => ({
				ObjectPattern: node => {
					context.report({message: 'No object destructure; use property access.', node})
				}
			}),
			meta: {messages: {default: 'No object destructure; use property access.'}, type: 'problem'}
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
				}
			}),
			meta: {messages: {default: 'Inline wrapper.'}, type: 'problem'}
		},
		'no-private-test-import': {
			create: context => ({
				ImportDeclaration: node => {
					if (
						/\.test\.[cm]?[jt]sx?$/.test(context.filename) &&
						(node.source.value.startsWith('../src/') ||
							node.source.value.includes('/src/lib/') ||
							node.source.value.includes('/lib/'))
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
		'no-single-use-guard': {
			createOnce: context => ({
				Program: node => {
					for (const statement of node.body) {
						if (
							statement.type === 'FunctionDeclaration' &&
							statement.id?.name.startsWith('is') === true &&
							[...context.sourceCode.text.matchAll(new RegExp(`\\b${statement.id.name}\\b`, 'gu'))].length <= 2
						) {
							context.report({message: 'Inline guard.', node: statement})
						}
					}
				}
			}),
			meta: {messages: {default: 'Inline guard.'}, type: 'problem'}
		}
	}
} as const)
