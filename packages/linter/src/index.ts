#!/usr/bin/env bun

import {BunRuntime, BunServices} from '@effect/platform-bun'
import {Array, Effect, Option, Order, pipe, String} from 'effect'

import ts from 'typescript'

import {antiIndirectionRules} from './rules/anti-indirection.ts'
import {controlFlowRules} from './rules/control-flow.ts'
import {functionalEffectRules} from './rules/functional-effect.ts'
import {reactUiRules} from './rules/react-ui.ts'
import {typeIndirectionRules} from './rules/type-indirection.ts'

export const runEffect = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	const files = yield* collectFiles(options)

	if (Array.isReadonlyArrayEmpty(files)) return {diagnostics: [], files}

	const program = ts.createProgram(
		Array.map(files, filePath => `${options.cwd}/${filePath}`),
		readCompilerOptions(options.cwd)
	)
	const checker = program.getTypeChecker()
	const diagnostics = pipe(
		files,
		Array.flatMap(filePath => {
			const sourceFile = program.getSourceFile(`${options.cwd}/${filePath}`)

			return sourceFile ? analyzeSourceFile(filePath, sourceFile, checker) : []
		}),
		sortDiagnostics
	)

	return {diagnostics, files}
})

export function analyzeText(filePath: string, sourceText: string) {
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		String.endsWith('x')(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	)

	return pipe(analyzeSourceFile(filePath, sourceFile), sortDiagnostics)
}

export function analyzeTypedText(filePath: string, sourceText: string) {
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		String.endsWith('x')(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	)
	const compilerOptions = readCompilerOptions(process.cwd())
	const defaultHost = ts.createCompilerHost(compilerOptions)

	const program = ts.createProgram([filePath], compilerOptions, {
		...defaultHost,
		getSourceFile(requestedFilePath, languageVersion, onError, shouldCreateNewSourceFile) {
			if (
				pipe(requestedFilePath, String.replaceAll('\\', '/'), String.replace(RegExp('^\\.\\/'), '')) ===
				pipe(filePath, String.replaceAll('\\', '/'), String.replace(RegExp('^\\.\\/'), ''))
			) {
				return sourceFile
			}

			return defaultHost.getSourceFile(requestedFilePath, languageVersion, onError, shouldCreateNewSourceFile)
		}
	})

	return pipe(analyzeSourceFile(filePath, sourceFile, program.getTypeChecker()), sortDiagnostics)
}

export function renderText(
	diagnostics: readonly {
		rule: string
		severity: 'error'
		message: string
		fix: string
		filePath: string
		line: number
		column: number
		symbol: string
		text: string
	}[]
) {
	return Array.match(diagnostics, {
		onEmpty: () => '',
		onNonEmpty: diagnostics =>
			`${color('strict-lint v1', 'bold')}\n${Array.length(diagnostics)} issues\n\n${pipe(
				groupDiagnosticsByFile(diagnostics),
				Array.map(
					fileDiagnostics =>
						`${color(fileDiagnostics.filePath, 'file')} ${color(`${Array.length(fileDiagnostics.diagnostics)}`, 'dim')}\n${pipe(
							fileDiagnostics.diagnostics,
							Array.map(
								diagnostic =>
									`- ${color(`L${diagnostic.line}`, 'line')} ${color(`@${diagnostic.symbol}`, 'symbol')} ${color('"', 'quote')}${diagnostic.text}${color('"', 'quote')} ${color(diagnostic.rule, 'rule')} ${color(`-> ${diagnostic.fix}`, 'dim')}`
							),
							Array.join('\n')
						)}`
				),
				Array.join('\n\n')
			)}\n`
	})
}

export const StrictLinter = {
	analyzeText,
	analyzeTypedText,
	renderText,
	run: (options: {mode: string; cwd: string; paths?: string[]}) => Effect.runPromise(runEffect(options)),
	runEffect
}

const sourceFileExtensions = ['.js', '.jsx', '.ts', '.tsx']
const exclusionParts = ['node_modules', 'dist', 'build', 'coverage', '.turbo', '.next', '.output']
const fixHints = [
	['no-access-variable', 'inline access'],
	['no-accumulator-loop', 'use collection transform'],
	['no-any', 'use unknown or concrete type'],
	['no-ast-gettext-comparison', 'use AST predicate'],
	['no-async-await', 'use Effect'],
	['no-braced-single-line-guard', 'remove braces'],
	['cn-classname', 'use cn'],
	['floatingEffect', 'yield or assign Effect'],
	['no-class', 'use Effect service or Schema'],
	['no-configurable-helper', 'inline policy at boundary'],
	['no-default-export', 'export named value'],
	['no-derived-simple-variable', 'inline derived value'],
	['no-deep-parent-chain', 'use ts.findAncestor'],
	['no-discarded-array-transform', 'use Array.forEach'],
	['no-else', 'return early'],
	['no-error-constructor', 'use typed Effect failure'],
	['no-effect-antipatterns', 'use Effect.fnUntraced'],
	['no-effect-returning-function', 'use Effect.fnUntraced'],
	['no-export-namespace', 'export plain values'],
	['no-array-empty-ternary', 'use Array.match'],
	['no-imperative-array-transform', 'use collection transform'],
	['no-interface-for-object-shape', 'use inferred object shape'],
	['no-import-alias', 'use source import name'],
	['no-length-check', 'use collection predicate'],
	['no-local-namespace-type', 'inline local types'],
	['no-mutation', 'derive instead of mutate'],
	['no-named-function-args-type', 'infer args'],
	['no-namespace-props-type', 'infer props'],
	['no-native-prototype-method', 'use Effect helper'],
	['no-json-api', 'use Schema codec'],
	['no-map-set-mutation', 'use HashMap or HashSet'],
	['no-multiline-ternary', 'use early return'],
	['no-null-literal', 'use non-null state'],
	['no-option-from-conversion', 'use direct nullability'],
	['no-promise-api', 'use Effect'],
	['no-restricted-global', 'use Effect module'],
	['no-redundant-type-check', 'remove redundant runtime check'],
	['no-primitive-const', 'inline primitive'],
	['no-render-prop-element', 'render element directly'],
	['no-regex-literal', 'use RegExp'],
	['no-react-null-state', 'use undefined state'],
	['no-return-type-annotation', 'infer return type'],
	['no-redundant-void-return', 'return void call directly'],
	['no-simple-condition-variable', 'inline condition'],
	['no-schema-type-order', 'move type before schema'],
	['no-single-use-interface', 'inline interface'],
	['no-single-use-type', 'inline type'],
	['no-single-use-top-level-variable', 'inline module variable'],
	['no-single-use-variable', 'inline variable'],
	['no-small-literal-variable', 'inline literal'],
	['no-tailwind-class-variables', 'inline className'],
	['no-top-level-mutable-singleton', 'move state into scope'],
	['no-throw', 'use typed failure'],
	['no-try-catch', 'use Effect error handling'],
	['no-type-alias-for-object-shape', 'use inferred object shape'],
	['no-type-assertion', 'redesign inference'],
	['no-unbraced-multiline-guard', 'add braces'],
	['no-useless-pipe', 'remove two-arg pipe'],
	['no-variable-type-annotation', 'infer variable type'],
	['no-yield-in-pipe', 'compose the Effect']
] as const
const colors = {
	bold: ['\u001b[1m', '\u001b[22m'],
	dim: ['\u001b[2m', '\u001b[22m'],
	file: ['\u001b[1;36m', '\u001b[0m'],
	line: ['\u001b[33m', '\u001b[39m'],
	quote: ['\u001b[32m', '\u001b[39m'],
	rule: ['\u001b[31m', '\u001b[39m'],
	symbol: ['\u001b[35m', '\u001b[39m']
}

function color(value: string, role: keyof typeof colors) {
	return process.env['NO_COLOR'] ? value : `${colors[role][0]}${value}${colors[role][1]}`
}

function fixHint(rule: string) {
	return pipe(
		fixHints,
		Array.findFirst(entry => entry[0] === rule),
		Option.map(entry => entry[1]),
		Option.getOrUndefined
	)
}

function groupDiagnosticsByFile(
	diagnostics: readonly {
		rule: string
		severity: 'error'
		message: string
		fix: string
		filePath: string
		line: number
		column: number
		symbol: string
		text: string
	}[]
) {
	return pipe(
		diagnostics,
		Array.map(diagnostic => diagnostic.filePath),
		Array.dedupe,
		Array.map(filePath => ({
			diagnostics: Array.filter(diagnostics, diagnostic => diagnostic.filePath === filePath),
			filePath
		})),
		Array.sort(
			pipe(
				Order.Number,
				Order.mapInput(
					(fileDiagnostics: {diagnostics: readonly unknown[]}) => -Array.length(fileDiagnostics.diagnostics)
				)
			)
		)
	)
}

const collectFiles = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	const selectedPaths = yield* collectSelectedPaths(options)
	const files = yield* expandPaths(options.cwd, selectedPaths)

	return pipe(files, Array.map(normalizePath), Array.dedupe, Array.filter(shouldLintFile))
})

const collectSelectedPaths = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	if (options.mode === 'paths') return options.paths ?? []

	if (options.mode === 'full') return ['.']

	return yield* runGitDiff(options.cwd, options.mode)
})

const runGitDiff = Effect.fnUntraced(function* (cwd: string, mode: string) {
	const process = Bun.spawn(
		[
			'git',
			'diff',
			...(mode === 'staged' ? ['--cached'] : []),
			'--name-only',
			'--diff-filter=ACMR',
			...(mode === 'changed' ? ['HEAD'] : [])
		],
		{cwd, stdout: 'pipe', stderr: 'pipe'}
	)
	const output = yield* Effect.promise(() => new Response(process.stdout).text())
	const exitCode = yield* Effect.promise(() => process.exited)

	if (exitCode !== 0) {
		return yield* pipe(
			Effect.promise(() => new Response(process.stderr).text()),
			Effect.map(String.trim),
			Effect.flatMap(Effect.fail)
		)
	}

	return pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))
})

const expandPaths = Effect.fnUntraced(function* (cwd: string, selectedPaths: string[]) {
	const allFiles = yield* collectDirectoryFiles(cwd, selectedPaths)

	return pipe(
		selectedPaths,
		Array.map(normalizePath),
		Array.filter(path => !isExcluded(path)),
		Array.flatMap(path => {
			if (path === '.') return allFiles

			if (Array.contains(sourceFileExtensions, extensionName(path))) return [path]

			return Array.filter(allFiles, filePath => String.startsWith(`${path}/`)(filePath))
		})
	)
})

const collectDirectoryFiles = Effect.fnUntraced(function* (cwd: string, selectedPaths: string[]) {
	const output = yield* runGitString(cwd, [
		'ls-files',
		'-co',
		'--exclude-standard',
		'--',
		...Array.match(selectedPaths, {
			onEmpty: () => ['.'],
			onNonEmpty: selectedPaths => Array.map(selectedPaths, normalizePath)
		})
	])

	return pipe(
		output,
		String.split('\n'),
		Array.filter(String.isNonEmpty),
		Array.map(normalizePath),
		Array.filter(path => !isExcluded(path))
	)
})

const runGitString = Effect.fnUntraced(function* (cwd: string, args: string[]) {
	const process = Bun.spawn(['git', ...args], {cwd, stdout: 'pipe', stderr: 'pipe'})
	const output = yield* Effect.promise(() => new Response(process.stdout).text())
	const exitCode = yield* Effect.promise(() => process.exited)

	if (exitCode !== 0) {
		return yield* pipe(
			Effect.promise(() => new Response(process.stderr).text()),
			Effect.map(String.trim),
			Effect.flatMap(Effect.fail)
		)
	}

	return output
})

function analyzeSourceFile(filePath: string, sourceFile: ts.SourceFile, checker?: ts.TypeChecker) {
	const references = collectReferences(sourceFile)
	const diagnostics = Array.empty<{
		rule: string
		severity: 'error'
		message: string
		fix: string
		filePath: string
		line: number
		column: number
		symbol: string
		text: string
	}>()
	function report(node: ts.Node, rule: string, message: string) {
		const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

		diagnostics.push({
			rule,
			severity: 'error',
			message,
			fix: fixHint(rule) ?? message,
			filePath,
			line: position.line + 1,
			column: position.character + 1,
			symbol: nearestSymbol(node),
			text: diagnosticText(sourceFile, node)
		})
	}
	function visit(node: ts.Node) {
		Array.forEach(
			[
				...antiIndirectionRules,
				...typeIndirectionRules,
				...functionalEffectRules,
				...controlFlowRules,
				...reactUiRules
			],
			rule => rule.apply(node, references, report, checker)
		)

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return diagnostics
}

function sortDiagnostics<T extends {filePath: string; line: number; column: number}>(diagnostics: T[]) {
	return Array.sort(diagnostics, compareDiagnosticPosition)
}

function compareDiagnosticPosition(
	left: {filePath: string; line: number; column: number},
	right: {filePath: string; line: number; column: number}
) {
	const fileOrder = String.Order(left.filePath, right.filePath)

	if (fileOrder !== 0) return fileOrder

	const lineOrder = Order.Number(left.line, right.line)

	return lineOrder === 0 ? Order.Number(left.column, right.column) : lineOrder
}

function readCompilerOptions(cwd: string) {
	const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')

	if (!configPath) return {}

	const config = ts.readConfigFile(configPath, ts.sys.readFile)

	return ts.parseJsonConfigFileContent(
		config.config,
		ts.sys,
		pipe(
			configPath,
			String.lastIndexOf('/'),
			Option.match({
				onNone: () => '.',
				onSome: index => String.slice(0, index)(configPath)
			})
		)
	).options
}

function nearestSymbol(node: ts.Node) {
	const symbolNode = ts.findAncestor(
		node,
		ancestor => ts.isSourceFile(ancestor) || namedDeclarationName(ancestor) !== '<root>'
	)

	return symbolNode ? namedDeclarationName(symbolNode) : '<root>'
}

function namedDeclarationName(node: ts.Node) {
	if (
		(ts.isFunctionDeclaration(node) ||
			ts.isClassDeclaration(node) ||
			ts.isInterfaceDeclaration(node) ||
			ts.isTypeAliasDeclaration(node) ||
			ts.isMethodDeclaration(node)) &&
		node.name
	) {
		return node.name.getText()
	}

	if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text

	return '<root>'
}

function diagnosticText(sourceFile: ts.SourceFile, node: ts.Node) {
	return pipe(
		diagnosticTextNode(node).getText(sourceFile),
		String.replace(RegExp('\\s+', 'g'), ' '),
		String.trim,
		String.slice(0, 120),
		String.replaceAll('"', '\\"')
	)
}

function diagnosticTextNode(node: ts.Node) {
	if (ts.isIdentifier(node) && isDeclarationName(node)) {
		return ts.findAncestor(node, ts.isVariableStatement) ?? node.parent
	}

	if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken === node) return node.parent

	return node.kind === ts.SyntaxKind.NullKeyword && node.parent ? node.parent : node
}

function collectReferences(sourceFile: ts.SourceFile) {
	const references = new Map<string, number>()
	function increment(name: string) {
		references.set(name, (references.get(name) ?? 0) + 1)
	}
	function visit(node: ts.Node) {
		if (ts.isIdentifier(node) && !isDeclarationName(node)) {
			increment(node.text)
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return references
}

function isDeclarationName(node: ts.Identifier) {
	return (
		(ts.isVariableDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isFunctionDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isParameter(node.parent) && node.parent.name === node) ||
		(ts.isInterfaceDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isTypeAliasDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isPropertySignature(node.parent) && node.parent.name === node) ||
		(ts.isPropertyDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
		(ts.isMethodDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isMethodSignature(node.parent) && node.parent.name === node)
	)
}

function shouldLintFile(filePath: string) {
	return Array.contains(sourceFileExtensions, extensionName(filePath)) && !isExcluded(filePath)
}

function isExcluded(filePath: string) {
	const normalized = normalizePath(filePath)
	return (
		pipe(
			normalized,
			String.split('/'),
			Array.some(part => Array.contains(exclusionParts, part))
		) ||
		String.endsWith('.d.ts')(normalized) ||
		String.endsWith('/bun.lock')(normalized) ||
		String.endsWith('/package-lock.json')(normalized) ||
		String.endsWith('/pnpm-lock.yaml')(normalized) ||
		RegExp('\\.gen\\.[cm]?[jt]sx?$').test(normalized) ||
		String.includes('/components/ui/')(normalized) ||
		String.startsWith('components/ui/')(normalized) ||
		String.startsWith('.opencode/resources/')(normalized) ||
		String.startsWith('.opencode/plans/')(normalized)
	)
}

function normalizePath(filePath: string) {
	return pipe(filePath, String.replaceAll('\\', '/'), String.replace(RegExp('^\\.\\/'), ''))
}

function extensionName(filePath: string) {
	const index = pipe(
		filePath,
		String.lastIndexOf('.'),
		Option.getOrElse(() => -1)
	)

	return index === -1 ? '' : String.slice(index)(filePath)
}

function parseRunOptions(args: string[]) {
	return pipe(
		args,
		Array.head,
		Option.match({
			onNone: () => ({cwd: process.cwd(), mode: 'full'}),
			onSome: mode => {
				if (Array.contains(['staged', 'unstaged', 'changed', 'full'], mode)) return {cwd: process.cwd(), mode}

				return {cwd: process.cwd(), mode: 'paths', paths: args}
			}
		})
	)
}

const cli = Effect.fnUntraced(function* () {
	const result = yield* runEffect(parseRunOptions(Array.drop(Bun.argv, 2)))

	yield* Effect.sync(() => process.stdout.write(renderText(result.diagnostics)))

	return yield* Effect.sync(() =>
		process.exit(
			Array.match(result.diagnostics, {
				onEmpty: () => 0,
				onNonEmpty: () => 1
			})
		)
	)
})

if (import.meta.main) {
	BunRuntime.runMain(Effect.provide(cli(), BunServices.layer))
}
