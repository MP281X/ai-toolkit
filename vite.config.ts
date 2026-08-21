import {Array, pipe} from 'effect'

import {defineConfig} from 'vite-plus'
import type {ViteUserConfig} from 'vite-plus'

const effectModuleObjects = [
	'Array',
	'AsyncResult',
	'Atom',
	'AtomRpc',
	'BigDecimal',
	'Boolean',
	'Cause',
	'Channel',
	'ChildProcess',
	'ChildProcessSpawner',
	'Chunk',
	'Clock',
	'Config',
	'ConfigProvider',
	'Context',
	'DateTime',
	'Duration',
	'Effect',
	'Either',
	'Encoding',
	'Equal',
	'Exit',
	'FetchHttpClient',
	'Fiber',
	'FiberId',
	'FiberMap',
	'FiberRef',
	'FiberSet',
	'FileSystem',
	'Function',
	'Hash',
	'HashMap',
	'HashSet',
	'HttpClient',
	'HttpMiddleware',
	'HttpRouter',
	'HttpServer',
	'HttpServerRequest',
	'HttpServerResponse',
	'HttpStaticServer',
	'Iterable',
	'Layer',
	'List',
	'Match',
	'MutableHashMap',
	'Number',
	'Option',
	'Order',
	'Path',
	'Predicate',
	'Prompt',
	'PubSub',
	'Random',
	'Record',
	'Redacted',
	'Ref',
	'Request',
	'Response',
	'RcMap',
	'Rpc',
	'RpcGroup',
	'RpcSerialization',
	'RpcServer',
	'Schedule',
	'Schema',
	'Scope',
	'Semaphore',
	'Socket',
	'Stream',
	'String',
	'Struct',
	'SubscriptionRef',
	'Tool',
	'Toolkit',
	'Tuple',
	'path'
]

const effectPropertyRestrictions = pipe(
	[
		'at',
		'catch',
		'charAt',
		'charCodeAt',
		'codePointAt',
		'concat',
		'endsWith',
		'entries',
		'every',
		'fill',
		'filter',
		'finally',
		'find',
		'findIndex',
		'findLast',
		'findLastIndex',
		'flat',
		'flatMap',
		'forEach',
		'includes',
		'indexOf',
		'join',
		'keys',
		'lastIndexOf',
		'localeCompare',
		'map',
		'match',
		'matchAll',
		'normalize',
		'padEnd',
		'padStart',
		'pop',
		'push',
		'reduce',
		'reduceRight',
		'repeat',
		'replace',
		'replaceAll',
		'reverse',
		'search',
		'shift',
		'slice',
		'some',
		'sort',
		'splice',
		'split',
		'startsWith',
		'substring',
		'then',
		'toLocaleLowerCase',
		'toLocaleUpperCase',
		'toLowerCase',
		'toReversed',
		'toSorted',
		'toSpliced',
		'toUpperCase',
		'trim',
		'trimEnd',
		'trimStart',
		'unshift',
		'values',
		'with'
	],
	Array.map(property => ({allowObjects: effectModuleObjects, message: 'Use an Effect module function.', property}))
)

const noRestrictedProperties: NonNullable<NonNullable<ViteUserConfig['lint']>['rules']>['no-restricted-properties'] = [
	'error',
	{message: 'Use standalone pipe.', property: 'pipe'},
	...effectPropertyRestrictions,
	{allowObjects: ['Predicate'], message: 'Use Predicate.hasProperty.', property: 'hasOwnProperty'},
	{message: 'Use an owned runtime.', object: 'Effect', property: 'runFork'},
	{message: 'Use an owned runtime.', object: 'Effect', property: 'runPromise'},
	{message: 'Use an owned runtime.', object: 'Effect', property: 'runPromiseExit'},
	{message: 'Use an owned runtime.', object: 'Effect', property: 'runSync'},
	{message: 'Use an owned runtime.', object: 'Effect', property: 'runSyncExit'},
	{message: 'Use Number.max.', object: 'Math', property: 'max'},
	{message: 'Use Number.min.', object: 'Math', property: 'min'},
	{message: 'Use Number.round.', object: 'Math', property: 'round'},
	{message: 'React Compiler owns memoization.', object: 'React', property: 'memo'},
	{message: 'React Compiler owns memoization.', object: 'React', property: 'useMemo'},
	{message: 'React Compiler owns memoization.', object: 'React', property: 'useCallback'},
	{message: 'Pass refs as props in React 19.', object: 'React', property: 'forwardRef'},
	{message: 'Use useRef in function components.', object: 'React', property: 'createRef'},
	{message: 'Use function components.', object: 'React', property: 'Component'},
	{message: 'Use function components.', object: 'React', property: 'PureComponent'},
	{message: 'Use Schema.Struct.', object: 'Schema', property: 'Class'},
	{message: 'Use a branded schema.', object: 'Schema', property: 'Opaque'},
	{message: 'Use Schema.Struct.', object: 'Schema', property: 'TaggedClass'},
	{message: 'Use schema-backed data.', object: 'Data', property: 'Class'},
	{message: 'Use Schema.TaggedError.', object: 'Data', property: 'Error'},
	{message: 'Use schema-backed data.', object: 'Data', property: 'TaggedClass'},
	{message: 'Use Schema.TaggedError.', object: 'Data', property: 'TaggedError'}
]

export default defineConfig({
	create: {
		templates: [
			{name: 'app', description: 'Create a full-stack Deslop application', template: './tools/create-app'},
			{name: 'package', description: 'Create a standard Deslop package', template: './tools/create-package'}
		]
	},
	fmt: {
		ignorePatterns: [
			'**/*.gen.ts',
			'packages/components/src/components/svgs/**',
			'packages/components/src/components/ui/**'
		],

		arrowParens: 'avoid',
		bracketSpacing: false,
		objectWrap: 'collapse',
		printWidth: 120,
		semi: false,
		singleQuote: true,
		sortPackageJson: {sortScripts: true},
		trailingComma: 'none',
		useTabs: true,

		sortTailwindcss: {functions: ['cn']},

		sortImports: {
			customGroups: [
				{elementNamePattern: ['@effect/**'], groupName: 'effectPackages', selector: 'external'},
				{elementNamePattern: ['effect'], groupName: 'effect', selector: 'external'},
				{elementNamePattern: ['@deslop/**'], groupName: 'aiToolkit', selector: 'external'},
				{elementNamePattern: ['@/**', '#*', '~/**'], groupName: 'aliases', selector: 'internal'}
			],
			groups: [
				['side_effect', 'side_effect_style'],
				{newlinesBetween: true},
				'builtin',
				{newlinesBetween: true},
				'effectPackages',
				'effect',
				{newlinesBetween: true},
				'external',
				{newlinesBetween: true},
				'aiToolkit',
				{newlinesBetween: true},
				'aliases',
				{newlinesBetween: true},
				'parent',
				'sibling',
				'index'
			],
			internalPattern: ['@/', '~/', '#', '@deslop/']
		}
	},
	lint: {
		categories: {
			correctness: 'off',
			nursery: 'off',
			pedantic: 'off',
			perf: 'off',
			restriction: 'off',
			style: 'off',
			suspicious: 'off'
		},
		env: {browser: true, builtin: true, node: true},
		ignorePatterns: [
			'**/*.gen.ts',
			'tools/*/template/**',
			'packages/components/src/components/svgs/**',
			'packages/components/src/components/ui/**'
		],
		jsPlugins: [{name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin'}],
		options: {denyWarnings: true, reportUnusedDisableDirectives: 'deny', typeAware: true, typeCheck: true},
		overrides: [
			{files: ['**/*.config.ts', '**/main.*'], rules: {'import/no-default-export': 'off', 'sort-keys': 'off'}},
			{
				files: ['.opencode/instructions.ts', 'tools/linter/src/oxlint-plugin.ts'],
				rules: {'import/no-default-export': 'off', 'no-param-reassign': 'off'}
			},
			{
				files: ['**/*.tsx'],
				rules: {'typescript/require-await': 'error', 'typescript/strict-void-return': 'off', 'unicorn/no-null': 'off'}
			}
		],
		plugins: ['eslint', 'typescript', 'oxc', 'import', 'react', 'unicorn'],
		rules: {
			// TypeScript type shape
			'@typescript-eslint/array-type': ['error', {default: 'array'}],
			'@typescript-eslint/consistent-type-assertions': [
				'error',
				{arrayLiteralTypeAssertions: 'never', assertionStyle: 'never', objectLiteralTypeAssertions: 'never'}
			],
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/consistent-generic-constructors': 'error',
			'@typescript-eslint/consistent-indexed-object-style': 'error',
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{fixStyle: 'separate-type-imports', prefer: 'type-imports'}
			],
			'@typescript-eslint/method-signature-style': 'error',
			'@typescript-eslint/prefer-function-type': 'error',

			// TypeScript correctness
			'@typescript-eslint/no-array-delete': 'error',
			'@typescript-eslint/no-base-to-string': 'error',
			'@typescript-eslint/no-confusing-void-expression': 'error',
			'@typescript-eslint/no-deprecated': 'error',
			'@typescript-eslint/no-duplicate-type-constituents': 'error',
			'@typescript-eslint/no-dynamic-delete': 'error',
			'@typescript-eslint/no-empty-object-type': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-import-type-side-effects': 'error',
			'@typescript-eslint/no-inferrable-types': 'error',
			'@typescript-eslint/no-invalid-void-type': 'error',
			'@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
			'@typescript-eslint/no-misused-spread': 'error',
			'@typescript-eslint/no-namespace': ['error', {allowDeclarations: true}],
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/no-redundant-type-constituents': 'error',
			'@typescript-eslint/no-require-imports': 'error',
			'@typescript-eslint/no-this-alias': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
			'@typescript-eslint/no-unnecessary-template-expression': 'error',
			'@typescript-eslint/no-unnecessary-type-arguments': 'error',
			'@typescript-eslint/no-unnecessary-type-constraint': 'error',
			'@typescript-eslint/no-unnecessary-type-conversion': 'error',
			'@typescript-eslint/no-unnecessary-type-parameters': 'error',
			'@typescript-eslint/no-unsafe-argument': 'error',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/no-unsafe-declaration-merging': 'error',
			'@typescript-eslint/no-unsafe-function-type': 'error',
			'@typescript-eslint/no-unsafe-member-access': 'error',
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/no-useless-empty-export': 'error',
			'@typescript-eslint/unified-signatures': 'error',
			'typescript/await-thenable': 'error',
			'typescript/no-unnecessary-qualifier': 'error',
			'typescript/no-wrapper-object-types': 'error',
			'typescript/unbound-method': 'error',

			// TypeScript preferences
			'@typescript-eslint/prefer-as-const': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',

			// TypeScript expression boundaries
			'@typescript-eslint/restrict-plus-operands': 'error',
			'@typescript-eslint/restrict-template-expressions': 'error',
			'@typescript-eslint/strict-boolean-expressions': 'error',
			'@typescript-eslint/strict-void-return': 'error',

			// JavaScript style
			'arrow-body-style': ['error', 'as-needed'],
			curly: ['error', 'multi-line', 'consistent'],
			eqeqeq: 'error',
			'func-names': ['error', 'as-needed', {generators: 'never'}],
			'func-style': ['error', 'declaration'],

			// Imports
			'import/newline-after-import': 'error',
			'import/no-commonjs': 'error',
			'import/no-absolute-path': 'error',
			'import/no-default-export': 'error',
			'import/no-duplicates': 'error',
			'import/no-empty-named-blocks': 'error',
			'import/no-mutable-exports': 'error',
			'import/no-relative-parent-imports': 'error',
			'import/no-self-import': 'error',
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							importNames: ['Component', 'PureComponent', 'createRef', 'forwardRef', 'memo', 'useCallback', 'useMemo'],
							message: 'Use React 19 function components and let React Compiler own memoization.',
							name: 'react'
						}
					],
					patterns: [{message: 'Use public package exports.', regex: '^@deslop/[^/]+/(?:src|lib)(?:/|$)'}]
				}
			],

			// JavaScript correctness
			'no-continue': 'error',
			'no-cond-assign': 'error',
			'no-control-regex': 'error',
			'no-debugger': 'error',
			'no-else-return': 'error',
			'no-empty-function': ['error', {allow: ['arrowFunctions']}],
			'no-eval': 'error',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-extra-boolean-cast': 'error',
			'no-implied-eval': 'error',
			'no-invalid-regexp': 'error',
			'no-iterator': 'error',
			'no-lonely-if': 'error',
			'no-misleading-character-class': 'error',
			'no-multi-assign': 'error',
			'no-negated-condition': 'error',
			'no-nested-ternary': 'error',
			'no-new': 'error',
			'no-param-reassign': ['error', {props: true}],
			'no-proto': 'error',
			'no-plusplus': 'error',
			'no-restricted-globals': [
				'error',
				'AbortController',
				'Array',
				'Boolean',
				'Error',
				'Map',
				'Number',
				'Object',
				'Promise',
				'Reflect',
				'Set',
				'String',
				'WeakMap',
				'WeakSet',
				'global',
				'globalThis'
			],
			'no-restricted-properties': noRestrictedProperties,
			'no-restricted-exports': ['error', {restrictedNamedExportsPattern: 'Live$'}],
			'no-shadow': [
				'error',
				{allow: ['Array', 'Boolean', 'Console', 'Effect', 'HashMap', 'Number', 'Option', 'Schema', 'String']}
			],
			'no-self-assign': 'error',
			'no-sparse-arrays': 'error',
			'no-throw-literal': 'error',
			'no-unmodified-loop-condition': 'error',
			'no-unneeded-ternary': 'error',
			'no-unsafe-finally': 'error',
			'no-useless-assignment': 'error',
			'no-useless-backreference': 'error',
			'no-useless-catch': 'error',
			'no-useless-call': 'error',
			'no-useless-computed-key': 'error',
			'no-useless-concat': 'error',
			'no-useless-constructor': 'error',
			'no-useless-escape': 'error',
			'no-useless-rename': 'error',
			'no-useless-return': 'error',
			'no-unused-expressions': 'error',
			'no-void': 'error',
			'object-shorthand': 'error',

			// Oxc
			'oxc/branches-sharing-code': 'error',
			'oxc/no-accumulating-spread': 'error',
			'oxc/no-map-spread': 'error',
			'oxc/only-used-in-recursion': 'error',

			// JavaScript preferences
			'prefer-arrow-callback': 'error',
			'prefer-const': ['error', {destructuring: 'all'}],
			'prefer-template': 'error',
			'require-unicode-regexp': 'error',

			// React
			'react/button-has-type': 'error',
			'react/checked-requires-onchange-or-readonly': 'error',
			'react/exhaustive-deps': 'error',
			'react/iframe-missing-sandbox': 'error',
			'react/jsx-boolean-value': ['error', 'never'],
			'react/jsx-curly-brace-presence': ['error', {children: 'never', propElementValues: 'always', props: 'never'}],
			'react/jsx-fragments': ['error', 'syntax'],
			'react/jsx-key': 'error',
			'react/jsx-no-script-url': 'error',
			'react/jsx-no-target-blank': 'error',
			'react/jsx-no-useless-fragment': 'error',
			'react/no-children-prop': 'error',
			'react/no-array-index-key': 'error',
			'react/no-clone-element': 'error',
			'react/no-danger': 'error',
			'react/no-object-type-as-default-prop': 'error',
			'react/no-react-children': 'error',
			'react/no-unknown-property': 'error',
			'react/no-unstable-nested-components': ['error', {allowAsProps: true}],
			'react/rules-of-hooks': 'error',
			'react/self-closing-comp': 'error',
			'react/void-dom-elements-no-children': 'error',

			// JavaScript object order
			'sort-keys': ['error', 'asc', {allowLineSeparatedGroups: true, natural: true}],

			// TypeScript syntax
			'typescript/ban-ts-comment': ['error', {'ts-nocheck': true}],
			'typescript/no-restricted-types': [
				'error',
				{
					types: {
						AbortController: 'Use Effect interruption.',
						Date: 'Use DateTime.',
						Error: 'Use Schema.TaggedError.',
						Map: 'Use HashMap.',
						Promise: 'Use Effect.',
						Readonly: 'Use a mutable type shape.',
						ReadonlyArray: 'Use T[].',
						ReadonlyMap: 'Use HashMap.',
						ReadonlySet: 'Use HashSet.',
						Set: 'Use HashSet.',
						Iterable: 'Use T[].',
						undefined: 'Use an optional property, optional parameter, inference, or Option.',
						WeakMap: 'Use Effect-owned state.',
						WeakSet: 'Use Effect-owned state.'
					}
				}
			],
			'typescript/no-unnecessary-type-assertion': 'error',
			'typescript/no-useless-default-assignment': 'error',
			'typescript/switch-exhaustiveness-check': [
				'error',
				{considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false}
			],

			// Unicorn
			'unicorn/no-immediate-mutation': 'error',
			'unicorn/no-null': 'error',
			'unicorn/no-object-as-default-parameter': 'error',
			'unicorn/no-process-exit': 'error',
			'unicorn/no-static-only-class': 'error',
			'unicorn/no-useless-fallback-in-spread': 'error',
			'unicorn/no-useless-length-check': 'error',
			'unicorn/no-useless-spread': 'error',
			'unicorn/no-useless-switch-case': 'error',
			'unicorn/prefer-logical-operator-over-ternary': 'error',
			'unicorn/prefer-optional-catch-binding': 'error',

			// JavaScript globals and Vite Plus
			'use-isnan': 'error',
			'vite-plus/prefer-vite-plus-imports': 'error'
		},
		settings: {react: {version: '19.0'}}
	},
	test: {
		environment: 'node',
		include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'tools/*/src/**/*.test.ts'],
		passWithNoTests: true,
		pool: 'forks'
	}
})
