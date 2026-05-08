#!/usr/bin/env bun

import {Array, Effect, flow, Option, Order, pipe, String} from 'effect'

import ts from 'typescript'

import {declarationName} from '#lib/ts.ts'
import {architectureRules} from '#rules/architecture.ts'
import {controlFlowRules} from '#rules/control-flow.ts'
import {effectRules} from '#rules/effect.ts'
import {shouldRunRule} from '#rules/helpers.ts'
import {indirectionRules} from '#rules/indirection.ts'
import {reactUiRules} from '#rules/react-ui.ts'
import {typeSafetyRules} from '#rules/type-safety.ts'

type Diagnostic = {
	readonly rule: string
	readonly severity: 'error'
	readonly message: string
	readonly filePath: string
	readonly line: number
	readonly column: number
	readonly symbol: string
	readonly text: string
}

export const runDeslop = Effect.fnUntraced(function* (options: {
	readonly mode: string
	readonly cwd: string
	readonly paths?: readonly string[]
}) {
	const files = yield* collectFiles(options)
	if (Array.isReadonlyArrayEmpty(files)) return {diagnostics: [], files}
	const programFiles = yield* collectFiles({...options, mode: 'full', paths: ['.']})

	const program = ts.createProgram(
		Array.map(programFiles, filePath => `${options.cwd}/${filePath}`),
		readCompilerOptions(options.cwd)
	)
	const checker = program.getTypeChecker()
	const sourceFiles = Array.flatMap(files, filePath => {
		return Array.fromNullishOr(program.getSourceFile(`${options.cwd}/${filePath}`))
	})
	const programSourceFiles = Array.flatMap(programFiles, filePath => {
		return Array.fromNullishOr(program.getSourceFile(`${options.cwd}/${filePath}`))
	})
	const references = collectReferences(programSourceFiles)
	const referenceFiles = collectReferenceFiles(programSourceFiles)
	const declarations = collectDeclarations(programSourceFiles)
	const diagnostics = pipe(
		sourceFiles,
		Array.flatMap(sourceFile => {
			const filePath = normalizePath(sourceFile.fileName).replace(`${normalizePath(options.cwd)}/`, '')
			return analyzeSourceFile(filePath, sourceFile, references, referenceFiles, declarations, checker, program)
		}),
		Array.sort(compareDiagnosticPosition)
	)

	return {diagnostics, files}
})

export function analyzeText(filePath: string, sourceText: string) {
	const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath))
	return Array.sort(
		analyzeSourceFile(
			filePath,
			sourceFile,
			collectReferences([sourceFile]),
			collectReferenceFiles([sourceFile]),
			collectDeclarations([sourceFile])
		),
		compareDiagnosticPosition
	)
}

export function analyzeTypedText(filePath: string, sourceText: string) {
	const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath))
	const compilerOptions = readCompilerOptions(process.cwd())
	const defaultHost = ts.createCompilerHost(compilerOptions)
	const program = ts.createProgram([filePath], compilerOptions, {
		...defaultHost,
		getSourceFile(requestedFilePath, languageVersion, onError, shouldCreateNewSourceFile) {
			if (normalizePath(requestedFilePath) === normalizePath(filePath)) return sourceFile
			return defaultHost.getSourceFile(requestedFilePath, languageVersion, onError, shouldCreateNewSourceFile)
		}
	})

	return Array.sort(
		analyzeSourceFile(
			filePath,
			sourceFile,
			collectReferences([sourceFile]),
			collectReferenceFiles([sourceFile]),
			collectDeclarations([sourceFile]),
			program.getTypeChecker(),
			program
		),
		compareDiagnosticPosition
	)
}

export function renderText(diagnostics: readonly Diagnostic[]) {
	return Array.match(diagnostics, {
		onEmpty: () => '',
		onNonEmpty: diagnostics => {
			return `${pipe(
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
		}
	})
}

const colors = {
	code: ['\u001b[2m', '\u001b[22m'],
	count: ['\u001b[2m', '\u001b[22m'],
	file: ['\u001b[1;35m', '\u001b[0m'],
	help: ['\u001b[36m', '\u001b[39m'],
	label: ['\u001b[2m', '\u001b[22m'],
	line: ['\u001b[33m', '\u001b[39m'],
	problem: ['\u001b[31m', '\u001b[39m'],
	rule: ['\u001b[2m', '\u001b[22m'],
	symbol: ['\u001b[36m', '\u001b[39m']
} as const

export function analyzeSourceFile(
	filePath: string,
	sourceFile: ts.SourceFile,
	references: ReadonlyMap<string, number>,
	referenceFiles: ReadonlyMap<string, ReadonlySet<string>>,
	declarations: ReadonlyMap<string, ts.Declaration>,
	checker?: ts.TypeChecker,
	program?: ts.Program
) {
	const diagnostics = Array.empty<Diagnostic>()
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
			text: pipe(
				node.getText(sourceFile),
				String.replace(RegExp('\\s+', 'g'), ' '),
				String.trim,
				String.slice(0, 120),
				String.replaceAll('"', '\\"')
			)
		})
	}
	function visit(node: ts.Node) {
		for (const rule of [
			...typeSafetyRules,
			...indirectionRules,
			...effectRules,
			...controlFlowRules,
			...reactUiRules,
			...architectureRules
		]) {
			if (shouldRunRule(rule.id, filePath)) {
				rule.run(node, {filePath, sourceFile, checker, program, references, referenceFiles, declarations, report})
			}
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return diagnostics
}

function color(value: string, role: keyof typeof colors) {
	return process.stdout.isTTY ? `${colors[role][0]}${value}${colors[role][1]}` : value
}

function compareFileDiagnostics(
	left: {readonly diagnostics: readonly Diagnostic[]},
	right: {readonly diagnostics: readonly Diagnostic[]}
) {
	return Order.Number(Array.length(right.diagnostics), Array.length(left.diagnostics))
}

function groupDiagnosticsByFile(diagnostics: readonly Diagnostic[]) {
	return Array.sort(
		Array.map(Array.dedupe(Array.map(diagnostics, diagnostic => diagnostic.filePath)), filePath => ({
			diagnostics: Array.filter(diagnostics, diagnostic => diagnostic.filePath === filePath),
			filePath
		})),
		compareFileDiagnostics
	)
}

function diagnosticWidths(diagnostics: readonly Diagnostic[]) {
	return {
		location: maxLength([
			'Problem',
			...Array.map(diagnostics, diagnostic => `L${diagnostic.line}:${diagnostic.column}`)
		]),
		symbol: maxLength(Array.map(diagnostics, diagnostic => `@${diagnostic.symbol}`))
	}
}

function renderDiagnosticBlock(diagnostic: Diagnostic, widths: {readonly location: number; readonly symbol: number}) {
	return `${color(padEnd(`L${diagnostic.line}:${diagnostic.column}`, widths.location), 'line')}  ${color(padEnd(`@${diagnostic.symbol}`, widths.symbol), 'symbol')}  ${color(diagnostic.rule, 'rule')}\n${color(padEnd('Code', widths.location), 'label')}  ${padEnd('', widths.symbol)}  ${color(diagnostic.text, 'code')}\n${color(padEnd('Problem', widths.location), 'label')}  ${padEnd('', widths.symbol)}  ${color(diagnostic.message, 'problem')}`
}

function maxLength(values: readonly string[]) {
	return Array.reduce(values, 0, (max, value) => Math.max(max, String.length(value)))
}

function padEnd(value: string, width: number) {
	return `${value}${String.repeat(Math.max(0, width - String.length(value)))(' ')}`
}

const collectFiles = Effect.fnUntraced(function* (options: {
	readonly mode: string
	readonly cwd: string
	readonly paths?: readonly string[]
}) {
	const selectedPaths = yield* collectSelectedPaths(options)
	const files = yield* expandPaths(options.cwd, selectedPaths)
	return pipe(
		files,
		Array.map(normalizePath),
		Array.dedupe,
		Array.filter(
			filePath => Array.contains(['.ts', '.tsx'] as const, extensionName(filePath)) && !isExcluded(filePath)
		),
		Array.sort(String.Order)
	)
})

const collectSelectedPaths = Effect.fnUntraced(function* (options: {
	readonly mode: string
	readonly cwd: string
	readonly paths?: readonly string[]
}) {
	if (options.mode === 'paths') return Array.fromIterable(options.paths ?? [])
	if (options.mode === 'full') return Array.fromIterable(options.paths ?? ['.'])
	const gitPaths = yield* runGitDiff(options.cwd, options.mode)
	return options.paths ? filterPathsByScope(gitPaths, Array.fromIterable(options.paths)) : gitPaths
})

function filterPathsByScope(filePaths: readonly string[], scopes: readonly string[]) {
	return Array.filter(filePaths, filePath => {
		return Array.some(Array.map(scopes, normalizePath), scope => pathMatchesScope(normalizePath(filePath), scope))
	})
}

function pathMatchesScope(filePath: string, scope: string) {
	if (scope === '.') return true
	return filePath === scope || String.startsWith(`${scope}/`)(filePath)
}

const runGitDiff = Effect.fnUntraced(function* (cwd: string, mode: string) {
	const process = Bun.spawn(
		['git', 'diff', '--name-only', '--diff-filter=ACMR', ...(mode === 'changed' ? ['HEAD'] : [])],
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

const expandPaths = Effect.fnUntraced(function* (cwd: string, selectedPaths: readonly string[]) {
	const allFiles = yield* collectDirectoryFiles(cwd, selectedPaths)
	return pipe(
		selectedPaths,
		Array.map(normalizePath),
		Array.filter(path => !isExcluded(path)),
		Array.flatMap(path => {
			if (path === '.') return allFiles
			if (Array.contains(['.ts', '.tsx'] as const, extensionName(path))) return [path]
			return Array.filter(allFiles, filePath => String.startsWith(`${path}/`)(filePath))
		})
	)
})

const collectDirectoryFiles = Effect.fnUntraced(function* (cwd: string, selectedPaths: readonly string[]) {
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

const runGitString = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
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

function compareDiagnosticPosition(
	left: {readonly filePath: string; readonly line: number; readonly column: number},
	right: {readonly filePath: string; readonly line: number; readonly column: number}
) {
	const fileOrder = String.Order(left.filePath, right.filePath)
	if (fileOrder !== 0) return fileOrder
	const lineOrder = Order.Number(left.line, right.line)
	return lineOrder === 0 ? Order.Number(left.column, right.column) : lineOrder
}

function readCompilerOptions(cwd: string) {
	const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')
	if (!configPath) return {strict: true, jsx: ts.JsxEmit.ReactJSX}
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
		ancestor => ts.isSourceFile(ancestor) || declarationName(ancestor) !== '<root>'
	)
	return symbolNode ? declarationName(symbolNode) : '<root>'
}

export function collectReferences(sourceFiles: readonly ts.SourceFile[]) {
	const references = new Map<string, number>()
	function increment(name: string) {
		references.set(name, (references.get(name) ?? 0) + 1)
	}
	function visit(node: ts.Node) {
		if (
			ts.isIdentifier(node) &&
			!(
				(ts.isVariableDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isFunctionDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isParameter(node.parent) && node.parent.name === node) ||
				(ts.isInterfaceDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isTypeAliasDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isPropertySignature(node.parent) && node.parent.name === node) ||
				(ts.isPropertyDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
				(ts.isMethodDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isMethodSignature(node.parent) && node.parent.name === node) ||
				(ts.isClassDeclaration(node.parent) && node.parent.name === node)
			)
		) {
			increment(node.text)
		}
		ts.forEachChild(node, visit)
	}
	Array.forEach(sourceFiles, visit)
	return references
}

export function collectReferenceFiles(sourceFiles: readonly ts.SourceFile[]) {
	const referenceFiles = new Map<string, Set<string>>()
	function record(name: string, filePath: string) {
		const files = referenceFiles.get(name) ?? new Set<string>()
		files.add(filePath)
		referenceFiles.set(name, files)
	}
	function visit(sourceFile: ts.SourceFile, node: ts.Node) {
		if (
			ts.isIdentifier(node) &&
			!(
				(ts.isVariableDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isFunctionDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isParameter(node.parent) && node.parent.name === node) ||
				(ts.isInterfaceDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isTypeAliasDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isPropertySignature(node.parent) && node.parent.name === node) ||
				(ts.isPropertyDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
				(ts.isMethodDeclaration(node.parent) && node.parent.name === node) ||
				(ts.isMethodSignature(node.parent) && node.parent.name === node) ||
				(ts.isClassDeclaration(node.parent) && node.parent.name === node)
			)
		) {
			record(node.text, normalizePath(sourceFile.fileName))
		}
		ts.forEachChild(node, child => visit(sourceFile, child))
	}
	Array.forEach(sourceFiles, sourceFile => visit(sourceFile, sourceFile))
	return referenceFiles
}

export function collectDeclarations(sourceFiles: readonly ts.SourceFile[]) {
	const declarations = new Map<string, ts.Declaration>()
	function visit(node: ts.Node) {
		const name = declarationName(node)
		if (
			name !== '<root>' &&
			(ts.isVariableDeclaration(node) ||
				ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isInterfaceDeclaration(node) ||
				ts.isTypeAliasDeclaration(node) ||
				ts.isEnumDeclaration(node) ||
				ts.isModuleDeclaration(node))
		) {
			declarations.set(name, node)
		}
		ts.forEachChild(node, visit)
	}
	Array.forEach(sourceFiles, visit)
	return declarations
}

function isExcluded(filePath: string) {
	const normalized = normalizePath(filePath)
	return (
		String.endsWith('.d.ts')(normalized) ||
		String.endsWith('/gen.ts')(normalized) ||
		String.endsWith('/gen.tsx')(normalized) ||
		RegExp('\\.gen\\.tsx?$').test(normalized) ||
		String.includes('/components/ui/')(normalized) ||
		String.startsWith('components/ui/')(normalized) ||
		String.startsWith('.opencode/resources/')(normalized) ||
		String.startsWith('.opencode/plans/')(normalized)
	)
}

const normalizePath = flow(
	String.replaceAll('\\', '/'),
	String.replace(RegExp('^\\.\\/'), ''),
	String.replace(RegExp('/+$'), ''),
	path => (path === '' ? '.' : path)
)

function extensionName(filePath: string) {
	const normalized = normalizePath(filePath)
	const index = normalized.lastIndexOf('.')
	return index === -1 ? '' : String.slice(index)(normalized)
}

function scriptKind(filePath: string) {
	return String.endsWith('.tsx')(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}
