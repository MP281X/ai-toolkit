#!/usr/bin/env bun

import {BunRuntime, BunServices} from '@effect/platform-bun'
import {Array, Effect, Option, Order, pipe, String} from 'effect'

import ts from 'typescript'

import {antiIndirectionRules} from './rules/anti-indirection.ts'
import {controlFlowRules} from './rules/control-flow.ts'
import {functionalEffectRules} from './rules/functional-effect.ts'
import {reactUiRules} from './rules/react-ui.ts'
import {typeIndirectionRules} from './rules/type-indirection.ts'

const ruleRegistry = [
	...antiIndirectionRules,
	...typeIndirectionRules,
	...functionalEffectRules,
	...controlFlowRules,
	...reactUiRules
]

export namespace StrictLinter {
	export type Mode = string

	export type RunOptions = {
		mode: Mode
		cwd: string
		paths?: string[]
	}

	export type Diagnostic = {
		rule: string
		severity: 'error'
		message: string
		fix: string
		filePath: string
		line: number
		column: number
		symbol: string
		text: string
	}

	export type Result = {
		diagnostics: Diagnostic[]
		files: string[]
	}

	export function runEffect(options: RunOptions) {
		return Effect.gen(function* () {
			const files = yield* collectFiles(options)
			const program = createProgram(options.cwd, files)
			const checker = program.getTypeChecker()
			const diagnostics = yield* pipe(
				files,
				Array.map(filePath => analyzeProgramFile(options.cwd, filePath, program, checker)),
				Effect.all,
				Effect.map(Array.flatten),
				Effect.map(sortDiagnostics)
			)

			return {diagnostics, files}
		})
	}

	export function run(options: RunOptions) {
		return Effect.runPromise(runEffect(options))
	}

	export function analyzeText(filePath: string, sourceText: string) {
		return pipe(
			createSourceFile(filePath, sourceText),
			sourceFile => analyzeSourceFile(filePath, sourceFile),
			sortDiagnostics
		)
	}

	export function renderText(diagnostics: Diagnostic[]) {
		return Array.isReadonlyArrayEmpty(diagnostics)
			? ''
			: `${color('strict-lint v1', 'bold')}\n${diagnostics.length} issues\n\n${pipe(
					groupDiagnosticsByFile(diagnostics),
					Array.map(
						fileDiagnostics =>
							`${color(fileDiagnostics.filePath, 'file')} ${color(`${fileDiagnostics.diagnostics.length}`, 'dim')}\n${pipe(
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
	}
}

const sourceFileExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const exclusionParts = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo', '.next', '.output'])
const gitModes = new Set<StrictLinter.Mode>(['staged', 'unstaged', 'changed', 'full'])
const fixHints = new Map([
	['no-access-variable', 'inline access'],
	['no-accumulator-loop', 'use collection transform'],
	['no-configurable-helper', 'inline policy at boundary'],
	['no-derived-simple-variable', 'inline derived value'],
	['no-else', 'return early'],
	['no-imperative-array-transform', 'use collection transform'],
	['no-interface-for-object-shape', 'use inferred object shape'],
	['no-length-check', 'use collection predicate'],
	['no-local-namespace-type', 'inline local types'],
	['no-mutation', 'derive instead of mutate'],
	['no-named-function-args-type', 'infer args'],
	['no-namespace-import-alias', 'import direct names'],
	['no-namespace-props-type', 'infer props'],
	['no-native-prototype-method', 'use Effect helper'],
	['no-null-literal', 'use non-null state'],
	['no-primitive-const', 'inline primitive'],
	['no-render-prop-element', 'render element directly'],
	['no-return-type-annotation', 'infer return type'],
	['no-simple-condition-variable', 'inline condition'],
	['no-schema-type-order', 'move type before schema'],
	['no-single-use-interface', 'inline interface'],
	['no-single-use-type', 'inline type'],
	['no-single-use-variable', 'inline variable'],
	['no-tailwind-class-variables', 'inline className'],
	['no-top-level-mutable-singleton', 'move state into scope'],
	['no-type-alias-for-object-shape', 'use inferred object shape'],
	['no-type-assertion', 'redesign inference'],
	['no-variable-type-annotation', 'infer variable type']
])
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

function groupDiagnosticsByFile(diagnostics: StrictLinter.Diagnostic[]) {
	const files = new Map<string, StrictLinter.Diagnostic[]>()

	pipe(
		diagnostics,
		Array.forEach(diagnostic => {
			files.set(diagnostic.filePath, [...(files.get(diagnostic.filePath) ?? []), diagnostic])
		})
	)

	return pipe(
		Array.fromIterable(files),
		Array.map(entry => ({filePath: entry[0], diagnostics: entry[1]})),
		Array.sort(
			pipe(
				Order.Number,
				Order.mapInput(
					(fileDiagnostics: {diagnostics: StrictLinter.Diagnostic[]}) => -fileDiagnostics.diagnostics.length
				)
			)
		)
	)
}

function collectFiles(options: StrictLinter.RunOptions) {
	return Effect.gen(function* () {
		const selectedPaths = yield* collectSelectedPaths(options)
		const files = yield* expandPaths(options.cwd, selectedPaths)

		return pipe(files, Array.map(normalizePath), Array.dedupe, Array.filter(shouldLintFile))
	})
}

function collectSelectedPaths(options: StrictLinter.RunOptions) {
	if (options.mode === 'paths') {
		return Effect.succeed(options.paths ?? [])
	}

	if (options.mode === 'full') {
		return Effect.succeed(['.'])
	}

	return runGitDiff(options.cwd, options.mode)
}

function runGitDiff(cwd: string, mode: StrictLinter.Mode) {
	return Effect.gen(function* () {
		const process = Bun.spawn(
			mode === 'staged'
				? ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR']
				: ['git', 'diff', '--name-only', '--diff-filter=ACMR', ...(mode === 'changed' ? ['HEAD'] : [])],
			{cwd, stdout: 'pipe', stderr: 'pipe'}
		)
		const output = yield* Effect.promise(() => new Response(process.stdout).text())
		const exitCode = yield* Effect.promise(() => process.exited)

		if (exitCode !== 0) {
			return yield* Effect.fail(
				new Error(pipe(yield* Effect.promise(() => new Response(process.stderr).text()), String.trim))
			)
		}

		return pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))
	})
}

function expandPaths(cwd: string, selectedPaths: string[]) {
	return Effect.gen(function* () {
		const allFiles = yield* collectDirectoryFiles(cwd, selectedPaths)

		return pipe(
			selectedPaths,
			Array.map(normalizePath),
			Array.filter(path => !isExcluded(path)),
			Array.flatMap(path => {
				if (path === '.') {
					return allFiles
				}

				if (sourceFileExtensions.has(extensionName(path))) {
					return [path]
				}

				return pipe(
					allFiles,
					Array.filter(filePath => pipe(filePath, String.startsWith(`${path}/`)))
				)
			})
		)
	})
}

function collectDirectoryFiles(cwd: string, selectedPaths: string[]) {
	return Effect.gen(function* () {
		const output = yield* runGitString(cwd, [
			'ls-files',
			'-co',
			'--exclude-standard',
			'--',
			...(Array.isReadonlyArrayEmpty(selectedPaths) ? ['.'] : pipe(selectedPaths, Array.map(normalizePath)))
		])

		return pipe(
			output,
			String.split('\n'),
			Array.filter(String.isNonEmpty),
			Array.map(normalizePath),
			Array.filter(path => !isExcluded(path))
		)
	})
}

function runGitString(cwd: string, args: string[]) {
	return Effect.gen(function* () {
		const process = Bun.spawn(['git', ...args], {cwd, stdout: 'pipe', stderr: 'pipe'})
		const output = yield* Effect.promise(() => new Response(process.stdout).text())
		const exitCode = yield* Effect.promise(() => process.exited)

		if (exitCode !== 0) {
			return yield* Effect.fail(
				new Error(pipe(yield* Effect.promise(() => new Response(process.stderr).text()), String.trim))
			)
		}

		return output
	})
}

function analyzeProgramFile(cwd: string, filePath: string, program: ts.Program, checker: ts.TypeChecker) {
	return Effect.sync(() => {
		const sourceFile = program.getSourceFile(`${cwd}/${filePath}`)

		return sourceFile ? analyzeSourceFile(filePath, sourceFile, checker) : []
	})
}

function analyzeSourceFile(filePath: string, sourceFile: ts.SourceFile, checker?: ts.TypeChecker) {
	const references = collectReferences(sourceFile)
	const diagnostics = Array.empty<StrictLinter.Diagnostic>()
	function report(node: ts.Node, rule: string, message: string) {
		const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

		diagnostics.push({
			rule,
			severity: 'error',
			message,
			fix: fixHints.get(rule) ?? message,
			filePath,
			line: position.line + 1,
			column: position.character + 1,
			symbol: nearestSymbol(node),
			text: diagnosticText(sourceFile, node)
		})
	}
	function visit(node: ts.Node) {
		pipe(
			ruleRegistry,
			Array.forEach(rule => rule.apply(node, references, report, checker))
		)

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return diagnostics
}

function createProgram(cwd: string, files: string[]) {
	return ts.createProgram(
		pipe(
			files,
			Array.map(filePath => `${cwd}/${filePath}`)
		),
		{
			allowJs: true,
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			noEmit: true,
			skipLibCheck: true,
			target: ts.ScriptTarget.Latest
		}
	)
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

	if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
		return node.name.text
	}

	return '<root>'
}

function diagnosticText(sourceFile: ts.SourceFile, node: ts.Node) {
	return pipe(
		diagnosticTextNode(node).getText(sourceFile),
		String.replace(/\s+/g, ' '),
		String.trim,
		String.slice(0, 120),
		String.replaceAll('"', '\\"')
	)
}

function diagnosticTextNode(node: ts.Node) {
	if (ts.isIdentifier(node) && isDeclarationName(node)) {
		return ts.isVariableDeclaration(node.parent) && ts.isVariableStatement(node.parent.parent.parent)
			? node.parent.parent.parent
			: node.parent
	}

	if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken === node) {
		return node.parent
	}

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
	return (
		sourceFileExtensions.has(extensionName(filePath)) &&
		!pipe(filePath, String.endsWith('.test.ts')) &&
		!isExcluded(filePath)
	)
}

function isExcluded(filePath: string) {
	const normalized = normalizePath(filePath)
	return (
		pipe(
			normalized,
			String.split('/'),
			Array.some(part => exclusionParts.has(part))
		) ||
		pipe(normalized, String.endsWith('.d.ts')) ||
		pipe(normalized, String.endsWith('/bun.lock')) ||
		pipe(normalized, String.endsWith('/package-lock.json')) ||
		pipe(normalized, String.endsWith('/pnpm-lock.yaml')) ||
		pipe(normalized, String.endsWith('.gen.ts')) ||
		pipe(normalized, String.includes('/components/ui/')) ||
		pipe(normalized, String.startsWith('components/ui/')) ||
		pipe(normalized, String.startsWith('.opencode/resources/')) ||
		pipe(normalized, String.startsWith('.opencode/plans/'))
	)
}

function sortDiagnostics(diagnostics: StrictLinter.Diagnostic[]) {
	return pipe(
		diagnostics,
		Array.sort(
			Order.combineAll([
				pipe(
					String.Order,
					Order.mapInput((diagnostic: StrictLinter.Diagnostic) => diagnostic.filePath)
				),
				pipe(
					Order.Number,
					Order.mapInput((diagnostic: StrictLinter.Diagnostic) => diagnostic.line)
				),
				pipe(
					Order.Number,
					Order.mapInput((diagnostic: StrictLinter.Diagnostic) => diagnostic.column)
				)
			])
		)
	)
}

function createSourceFile(filePath: string, sourceText: string) {
	return ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		pipe(filePath, String.endsWith('x')) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	)
}

function normalizePath(filePath: string) {
	return pipe(filePath, String.replaceAll('\\', '/'), String.replace(/^\.\//, ''))
}

function extensionName(filePath: string) {
	const index = pipe(
		filePath,
		String.lastIndexOf('.'),
		Option.getOrElse(() => -1)
	)

	return index === -1 ? '' : pipe(filePath, String.slice(index))
}

function parseRunOptions(args: string[]) {
	return pipe(
		args,
		Array.head,
		Option.match({
			onNone: () => ({cwd: process.cwd(), mode: 'full'}),
			onSome: mode =>
				gitModes.has(mode) ? {cwd: process.cwd(), mode} : {cwd: process.cwd(), mode: 'paths', paths: args}
		})
	)
}

const cli = Effect.gen(function* () {
	const result = yield* StrictLinter.runEffect(parseRunOptions(pipe(Bun.argv, Array.drop(2))))

	yield* Effect.sync(() => process.stdout.write(StrictLinter.renderText(result.diagnostics)))

	return yield* Effect.sync(() => process.exit(Array.isReadonlyArrayEmpty(result.diagnostics) ? 0 : 1))
})

if (import.meta.main) {
	BunRuntime.runMain(pipe(cli, Effect.provide(BunServices.layer)))
}
