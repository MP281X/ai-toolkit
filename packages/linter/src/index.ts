#!/usr/bin/env bun

import {BunServices} from '@effect/platform-bun'
import {Array, Effect, Option, Order, pipe, String} from 'effect'

import {Argument, Command, Flag} from 'effect/unstable/cli'
import ts from 'typescript'

import {antiIndirectionRules} from './rules/anti-indirection.ts'
import {controlFlowRules} from './rules/control-flow.ts'
import {functionalEffectRules} from './rules/functional-effect.ts'
import {reactUiRules} from './rules/react-ui.ts'
import {typeIndirectionRules} from './rules/type-indirection.ts'

export const runDeslop = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
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
			`${pipe(
				groupDiagnosticsByFile(diagnostics),
				Array.map(fileDiagnostics => {
					const widths = diagnosticWidths(fileDiagnostics.diagnostics)

					return `${color(fileDiagnostics.filePath, 'file')} ${color(`${Array.length(fileDiagnostics.diagnostics)}`, 'count')}\n\n${pipe(
						fileDiagnostics.diagnostics,
						Array.map(diagnostic => renderDiagnosticBlock(diagnostic, widths)),
						Array.join('\n\n')
					)}`
				}),
				Array.join('\n\n')
			)}\n`
	})
}

const sourceFileExtensions = ['.js', '.jsx', '.ts', '.tsx']
const exclusionParts = ['node_modules', 'dist', 'build', 'coverage', '.turbo', '.next', '.output']
const colors = {
	bold: ['\u001b[1m', '\u001b[22m'],
	code: ['\u001b[2m', '\u001b[22m'],
	count: ['\u001b[2m', '\u001b[22m'],
	dim: ['\u001b[2m', '\u001b[22m'],
	file: ['\u001b[1;36m', '\u001b[0m'],
	help: ['\u001b[36m', '\u001b[39m'],
	label: ['\u001b[2m', '\u001b[22m'],
	line: ['\u001b[33m', '\u001b[39m'],
	problem: ['\u001b[31m', '\u001b[39m'],
	rule: ['\u001b[2m', '\u001b[22m'],
	symbol: ['\u001b[36m', '\u001b[39m']
}

function color(value: string, role: keyof typeof colors) {
	return process.stdout.isTTY ? `${colors[role][0]}${value}${colors[role][1]}` : value
}

function groupDiagnosticsByFile(
	diagnostics: readonly {
		rule: string
		severity: 'error'
		message: string
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

function diagnosticWidths(
	diagnostics: readonly {
		line: number
		column: number
		symbol: string
	}[]
) {
	return {
		location: maxLength(Array.map(diagnostics, diagnostic => `L${diagnostic.line}:${diagnostic.column}`)),
		symbol: maxLength(Array.map(diagnostics, diagnostic => `@${diagnostic.symbol}`))
	}
}

function renderDiagnosticBlock(
	diagnostic: {
		rule?: string
		line: number
		column: number
		symbol: string
		text: string
		message: string
	},
	widths: {location: number; symbol: number}
) {
	const nextAction = nextActionFor(diagnostic.rule)

	return `${color(padEnd(`L${diagnostic.line}:${diagnostic.column}`, widths.location), 'line')}  ${color(padEnd(`@${diagnostic.symbol}`, widths.symbol), 'symbol')}  ${color(diagnostic.rule ?? 'diagnostic', 'rule')}\n${color(padEnd('Code', widths.location), 'label')}  ${padEnd('', widths.symbol)}  ${color(diagnostic.text, 'code')}\n${color(padEnd('Problem', widths.location), 'label')}  ${padEnd('', widths.symbol)}  ${color(diagnostic.message, 'problem')}${nextAction ? `\n${color(padEnd('Next', widths.location), 'label')}  ${padEnd('', widths.symbol)}  ${color(nextAction, 'help')}` : ''}`
}

function nextActionFor(rule: string | undefined) {
	if (rule === 'no-yield-in-pipe') {
		return 'Yield the Effect first, then transform its value with Effect.map or Effect.flatMap.'
	}

	if (rule === 'no-imperative-array-transform') {
		return 'Use Array helpers for pure transforms, Effect.forEach for effectful transforms, or Stream.unfoldEffect for worklist traversal.'
	}

	if (rule === 'no-unnecessary-effect-gen') {
		return 'Use the yielded Effect value directly, then compose providers or error handling around it.'
	}

	if (rule === 'prefer-const-literal-branch') return 'Return the literal with `as const` from the Match branch.'

	return
}

function maxLength(values: readonly string[]) {
	return Array.reduce(values, 0, (max, value) => Math.max(max, String.length(value)))
}

function padEnd(value: string, width: number) {
	return `${value}${String.repeat(Math.max(0, width - String.length(value)))(' ')}`
}

const collectFiles = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	const selectedPaths = yield* collectSelectedPaths(options)
	const files = yield* expandPaths(options.cwd, selectedPaths)

	return pipe(files, Array.map(normalizePath), Array.dedupe, Array.filter(shouldLintFile))
})

const collectSelectedPaths = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	if (options.mode === 'paths') return options.paths ?? []

	if (options.mode === 'full') return options.paths ?? ['.']

	const gitPaths = yield* runGitDiff(options.cwd, options.mode)

	return options.paths ? filterPathsByScope(gitPaths, options.paths) : gitPaths
})

function filterPathsByScope(filePaths: string[], scopes: string[]) {
	return Array.filter(filePaths, filePath =>
		Array.some(Array.map(scopes, normalizePath), scope => pathMatchesScope(normalizePath(filePath), scope))
	)
}

function pathMatchesScope(filePath: string, scope: string) {
	if (scope === '.') return true

	return filePath === scope || String.startsWith(`${scope}/`)(filePath)
}

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
	return pipe(
		filePath,
		String.replaceAll('\\', '/'),
		String.replace(RegExp('^\\.\\/'), ''),
		String.replace(RegExp('/+$'), ''),
		path => (path === '' ? '.' : path)
	)
}

function extensionName(filePath: string) {
	const index = pipe(
		filePath,
		String.lastIndexOf('.'),
		Option.getOrElse(() => -1)
	)

	return index === -1 ? '' : String.slice(index)(filePath)
}

const runAndRender = Effect.fnUntraced(function* (options: {mode: string; cwd: string; paths?: string[]}) {
	const result = yield* runDeslop(options)

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

export const deslopCommand = pipe(
	Command.make(
		'deslop',
		{
			staged: pipe(Flag.boolean('staged'), Flag.withDescription('Lint staged source files.')),
			unstaged: pipe(Flag.boolean('unstaged'), Flag.withDescription('Lint unstaged source files.')),
			changed: pipe(Flag.boolean('changed'), Flag.withDescription('Lint source files changed from HEAD.')),
			full: pipe(Flag.boolean('full'), Flag.withDescription('Lint every tracked source file.')),
			paths: pipe(
				Argument.string('path'),
				Argument.withDescription('File or directory to lint.'),
				Argument.variadic({min: 0})
			)
		},
		config => {
			const modes = [
				...(config.staged ? ['staged'] : []),
				...(config.unstaged ? ['unstaged'] : []),
				...(config.changed ? ['changed'] : []),
				...(config.full ? ['full'] : [])
			]

			if (Array.length(modes) > 1) {
				return Effect.fail('Use only one of --staged, --unstaged, --changed, or --full.')
			}

			return runAndRender({
				cwd: process.cwd(),
				mode: modes[0] ?? 'full',
				paths: Array.isReadonlyArrayEmpty(config.paths) ? undefined : [...config.paths]
			})
		}
	),
	Command.withDescription('Remove slop from TypeScript and React code.'),
	Command.withExamples([
		{command: 'bunx @ai-toolkit/deslop --staged', description: 'Lint staged files'},
		{command: 'bunx @ai-toolkit/deslop --changed src', description: 'Lint changed files under src'},
		{command: 'bunx @ai-toolkit/deslop packages/linter', description: 'Lint explicit paths'}
	])
)

if (import.meta.main) {
	Effect.runFork(
		pipe(
			Effect.provide(Command.runWith(deslopCommand, {version: '0.0.0'})(Array.drop(Bun.argv, 2)), BunServices.layer),
			Effect.catch(error =>
				Effect.sync(() => {
					process.stderr.write(`${error}\n`)
					process.exit(1)
				})
			)
		)
	)
}
