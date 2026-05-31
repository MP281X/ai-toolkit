import {defineConfig} from 'vite-plus'

export default defineConfig({
	fmt: {
		ignorePatterns: ['**/*.gen.ts', '**/package.json'],

		arrowParens: 'avoid',
		bracketSpacing: false,
		objectWrap: 'collapse',
		printWidth: 120,
		semi: false,
		singleQuote: true,
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
		ignorePatterns: ['**/*.gen.ts', '**/components/ui/**', '**/generated/**'],
		jsPlugins: [{name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin'}],
		options: {denyWarnings: true, reportUnusedDisableDirectives: 'deny', typeAware: true, typeCheck: true},
		overrides: [{files: ['**/*.config.ts'], rules: {'import/no-default-export': 'off'}}],
		plugins: ['eslint', 'typescript', 'oxc', 'import', 'react', 'unicorn'],
		rules: {
			'@typescript-eslint/array-type': ['error', {default: 'array'}],
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{fixStyle: 'separate-type-imports', prefer: 'type-imports'}
			],
			'@typescript-eslint/no-duplicate-type-constituents': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-inferrable-types': 'error',
			'@typescript-eslint/no-meaningless-void-operator': 'error',
			'@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
			'@typescript-eslint/no-namespace': ['error', {allowDeclarations: true}],
			'@typescript-eslint/no-redundant-type-constituents': 'error',
			'@typescript-eslint/no-unnecessary-template-expression': 'error',
			'@typescript-eslint/no-unnecessary-type-arguments': 'error',
			'@typescript-eslint/no-unnecessary-type-assertion': 'error',
			'@typescript-eslint/no-unnecessary-type-constraint': 'error',
			'@typescript-eslint/no-useless-empty-export': 'error',
			'@typescript-eslint/non-nullable-type-assertion-style': 'error',
			'@typescript-eslint/prefer-as-const': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',
			'@typescript-eslint/prefer-readonly': 'error',
			'arrow-body-style': ['error', 'as-needed'],
			curly: ['error', 'multi-line', 'consistent'],
			'func-names': ['error', 'as-needed', {generators: 'never'}],
			'func-style': ['error', 'declaration'],
			'no-console': 'error',
			'no-else-return': 'error',
			'no-empty-function': ['error', {allow: ['arrowFunctions']}],
			'no-extra-boolean-cast': 'error',
			'no-lonely-if': 'error',
			'no-param-reassign': ['error', {props: true}],
			'no-restricted-globals': ['error', 'global', 'globalThis', 'String', 'Boolean', 'Array'],
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							importNames: ['memo', 'useCallback', 'useMemo'],
							message: 'React Compiler handles memoization. Remove manual memoization.',
							name: 'react'
						}
					]
				}
			],
			'no-unneeded-ternary': 'error',
			'no-useless-concat': 'error',
			'no-useless-rename': 'error',
			'no-useless-return': 'error',
			'prefer-const': ['error', {destructuring: 'all'}],
			'prefer-object-spread': 'error',
			'react/jsx-key': 'error',
			'react/rules-of-hooks': 'error',
			'sort-keys': ['error', 'asc', {allowLineSeparatedGroups: true, natural: true}],
			'unicorn/no-useless-fallback-in-spread': 'error',
			'unicorn/no-useless-length-check': 'error',
			'unicorn/no-useless-promise-resolve-reject': 'error',
			'unicorn/no-useless-spread': 'error',
			'unicorn/no-useless-switch-case': 'error',
			'unicorn/prefer-logical-operator-over-ternary': 'error',
			'unicorn/prefer-number-properties': 'error',
			'use-isnan': 'error',
			'vite-plus/prefer-vite-plus-imports': 'error'
		},
		settings: {react: {version: '19.0'}}
	}
})
