import {Array} from 'effect'

import {describe, expect, test} from 'bun:test'
import {analyzeText} from '../index.ts'

function rulesFor(sourceText: string) {
	return Array.map(analyzeText('sample.ts', sourceText), diagnostic => diagnostic.rule)
}

describe('anti-indirection rules', () => {
	test('no-access-variable', () => {
		expect(rulesFor('const name = user.profile.name')).toContain('no-access-variable')
	})

	test('no-access-variable for non-null aliases', () => {
		expect(rulesFor('const currentEntry = selectedEntry!')).toContain('no-access-variable')
	})

	test('no-simple-condition-variable', () => {
		expect(rulesFor("const active = status === 'active'")).toContain('no-simple-condition-variable')
	})

	test('no-derived-simple-variable', () => {
		expect(rulesFor(`const href = \`/users/${'${'}user.id}\``)).toContain('no-derived-simple-variable')
	})

	test('allows identity-bearing derived variables', () => {
		expect(rulesFor(`const agentId = \`agent-${'${'}crypto.randomUUID()}\`; save(agentId)`)).not.toContain(
			'no-derived-simple-variable'
		)
	})

	test('no-single-use-variable', () => {
		expect(rulesFor('function run() { const value = getValue(); save(value) }')).toContain('no-single-use-variable')
	})

	test('no-small-literal-variable', () => {
		expect(
			rulesFor("function run() { const result = {output: 'ok'}; save(result); expect(result).toEqual(result) }")
		).toContain('no-small-literal-variable')
	})

	test('no-access-helper', () => {
		expect(rulesFor('function getName(user: {name: string}) { return user.name }')).toContain('no-access-helper')
	})

	test('no-low-value-function', () => {
		expect(rulesFor('const getValue = () => value + 1')).toContain('no-low-value-function')
	})

	test('no-low-value-function for simple declarations', () => {
		expect(
			rulesFor(
				"function commentSideKey(comment: {side?: 'deletions' | 'additions'}) { return comment.side === 'deletions' ? 'deletions' : 'file' }"
			)
		).toContain('no-low-value-function')
	})

	test('no-low-value-function for simple function variables', () => {
		expect(rulesFor('const getLabel = () => label')).toContain('no-low-value-function')
	})

	test('no-low-value-function ignores formatting', () => {
		expect(
			rulesFor(
				"function commentKey(comment: {filePath: string; lineNumber: number; side?: 'deletions' | 'additions'}) {\n\treturn `$" +
					'{comment.filePath}:$' +
					"{comment.side === 'deletions' ? 'deletions' : 'file'}:$" +
					'{comment.lineNumber}`\n}'
			)
		).toContain('no-low-value-function')
	})

	test('no-low-value-function for small private collection transforms', () => {
		expect(
			rulesFor(`function commentAnnotations(comments: readonly Comment[] | undefined) {
	return Array.map(comments ?? Array.empty<Comment>(), comment => ({
		side: comment.side ?? 'additions',
		lineNumber: comment.lineNumber,
		metadata: comment
	}))
}

save(commentAnnotations(comments))`)
		).toContain('no-low-value-function')
	})

	test('allows multi-statement private functions', () => {
		expect(
			rulesFor(`function patchResultContent(patch: string) {
	const fileDiff = getSingularPatch(patch)

	if (fileDiff.type === 'deleted') return ''

	return Array.join(
		Array.flatMap(fileDiff.hunks, hunk =>
			Array.flatMap(hunk.hunkContent, part =>
				Array.take(
					Array.drop(fileDiff.additionLines, part.additionLineIndex),
					part.type === 'context' ? part.lines : part.additions
				)
			)
		),
		''
	)
}`)
		).not.toContain('no-low-value-function')
	})

	test('allows exported low-value derived functions', () => {
		expect(
			rulesFor(
				"export function commentKey(comment: {filePath: string; lineNumber: number; side?: 'deletions' | 'additions'}) { return `$" +
					'{comment.filePath}:$' +
					"{comment.side === 'deletions' ? 'deletions' : 'file'}:$" +
					'{comment.lineNumber}` }'
			)
		).not.toContain('no-low-value-function')
	})

	test('no-single-expression-function', () => {
		expect(rulesFor('const getValue = () => value + 1; save(getValue())')).toContain('no-single-expression-function')
	})

	test('no-signature-wrapper', () => {
		expect(rulesFor('const getUser = (id: string) => api.user.get(id)')).toContain('no-signature-wrapper')
	})

	test('no-pass-through-function', () => {
		expect(rulesFor('const saveName = (name: string) => save(name)')).toContain('no-pass-through-function')
	})

	test('allows exported policy wrappers', () => {
		expect(
			rulesFor(
				'export function formatNumber(number: number) { return new Intl.NumberFormat(undefined, {notation: "compact"}).format(number) }'
			)
		).not.toContain('no-signature-wrapper')
		expect(rulesFor('export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }')).not.toContain(
			'no-signature-wrapper'
		)
	})

	test('keeps flagging exported low-value wrappers', () => {
		expect(rulesFor('export function getUser(id: string) { return api.user.get(id) }')).toContain(
			'no-signature-wrapper'
		)
	})

	test('no-signature-wrapper for declarations', () => {
		expect(rulesFor('function run(options: Options) { return Effect.runPromise(runEffect(options)) }')).toContain(
			'no-signature-wrapper'
		)
	})

	test('allows named predicate wrappers around collection checks', () => {
		expect(
			rulesFor('function isAlwaysTruthy(type: Type) { return typeParts(type).every(part => isTruthy(part)) }')
		).not.toContain('no-signature-wrapper')
	})

	test('allows named helpers around pipe transforms', () => {
		expect(rulesFor('function diagnosticText(node: Node) { return pipe(node.text, String.trim) }')).not.toContain(
			'no-signature-wrapper'
		)
	})

	test('allows single-use hook variables in components', () => {
		expect(rulesFor('function Screen() { const params = Route.useParams(); return params.id }')).not.toContain(
			'no-single-use-variable'
		)
	})

	test('still flags single-use non-hook call variables in components', () => {
		expect(rulesFor('function Screen() { const params = Route.getParams(); return params.id }')).toContain(
			'no-single-use-variable'
		)
	})

	test('no-call-shape-adapter', () => {
		expect(rulesFor('const saveName = (name: string) => save({name})')).toContain('no-call-shape-adapter')
	})

	test('no-helper-branch-growth', () => {
		expect(
			rulesFor(
				"const getLabel = (item: {name?: string; title?: string}) => { if (item.name) return item.name; if (item.title) return item.title; return 'Unknown' }"
			)
		).toContain('no-helper-branch-growth')
	})

	test('no-configurable-helper', () => {
		expect(rulesFor("const getLabel = (value: string, fallback = 'Unknown') => value || fallback")).toContain(
			'no-configurable-helper'
		)
	})

	test('no-primitive-const', () => {
		expect(rulesFor('const limit = 3')).toContain('no-primitive-const')
	})

	test('allows css constants with Tailwind-like tokens', () => {
		expect(rulesFor('const DIFF_CSS = `:host { --gap-token: flex; border: 1px solid red; }`')).not.toContain(
			'no-tailwind-class-variables'
		)
		expect(rulesFor('const DIFF_CSS = `:host { --gap-token: flex; border: 1px solid red; }`')).not.toContain(
			'no-derived-simple-variable'
		)
	})

	test('no-arg-destructuring', () => {
		expect(rulesFor('function save({name}: {name: string}) { return name }')).toContain('no-arg-destructuring')
	})

	test('no-arg-destructuring in callbacks', () => {
		expect(rulesFor('items.map(({name}) => name)')).toContain('no-arg-destructuring')
	})

	test('no-return-type-annotation in callbacks', () => {
		expect(rulesFor('items.map((item): string => item.name)')).toContain('no-return-type-annotation')
	})

	test('no-arrow-for-named', () => {
		expect(rulesFor('const submit = () => save()')).toContain('no-arrow-for-named')
	})

	test('allows recursive function type annotations', () => {
		expect(rulesFor('const collect: (value: number) => number = value => collect(value - 1)')).not.toContain(
			'no-variable-type-annotation'
		)
		expect(
			rulesFor(
				'const collect: (value: number) => Effect.Effect<number> = Effect.fnUntraced(function* (value) { return yield* collect(value - 1) })'
			)
		).not.toContain('no-variable-type-annotation')
	})

	test('no-effect-antipatterns for named function Effect.gen wrappers', () => {
		expect(rulesFor('function runEffect() { return Effect.gen(function* () { return yield* work }) }')).toContain(
			'no-effect-antipatterns'
		)
	})

	test('no-effect-antipatterns for arrow Effect.gen wrappers', () => {
		expect(rulesFor('const runEffect = () => Effect.gen(function* () { return yield* work })')).toContain(
			'no-effect-antipatterns'
		)
	})

	test('allows direct no-arg Effect.gen constants', () => {
		expect(rulesFor('const cli = Effect.gen(function* () { return yield* work })')).not.toContain(
			'no-effect-antipatterns'
		)
	})

	test('no-effect-returning-function', () => {
		expect(rulesFor('function collect() { return Effect.succeed([]) }')).toContain('no-effect-returning-function')
		expect(rulesFor('const collect = () => Effect.succeed([])')).toContain('no-effect-returning-function')
	})

	test('allows top-level variables used more than once', () => {
		expect(
			rulesFor('const compilerOptions = {strict: true}; ts.createProgram(files, compilerOptions); use(compilerOptions)')
		).not.toContain('no-single-use-top-level-variable')
	})

	test('flags small top-level arrays used once', () => {
		expect(rulesFor('const sourceFileExtensions = [".ts", ".tsx"]; use(sourceFileExtensions)')).toContain(
			'no-single-use-top-level-variable'
		)
	})

	test('no-single-use-top-level-variable', () => {
		expect(rulesFor('const ruleRegistry = [...a, ...b, ...c]; run(ruleRegistry)')).toContain(
			'no-single-use-top-level-variable'
		)
	})

	test('no-single-use-top-level-variable for small single-use expressions', () => {
		expect(rulesFor('const matcher = RegExp("test"); matcher.test(value)')).toContain(
			'no-single-use-top-level-variable'
		)
		expect(rulesFor('const names = ["a", "b"]; use(names)')).toContain('no-single-use-top-level-variable')
		expect(rulesFor('export const hooks = new Set(["memo", "useMemo"]); hooks.has(name)')).toContain(
			'no-single-use-top-level-variable'
		)
	})

	test('allows TanStack Router Route declarations', () => {
		expect(
			rulesFor("export const Route = createFileRoute('/(home)/$worktree/diff')({ component: DiffPage })")
		).not.toContain('no-single-use-top-level-variable')
	})
})
