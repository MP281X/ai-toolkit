import {Array} from 'effect'

import {expect, test} from 'bun:test'
import {analyzeTypedText} from '#lib/analyzer.ts'
import {expectRule} from './test-utils.ts'

test('no-type-assertion-except-as-const', () => {
	return expectRule({
		rule: 'no-type-assertion-except-as-const',
		source: 'declare const value: unknown\nconst user = value as User\n'
	})
})
test('prefer-strict-literal-const', () => {
	return expectRule({rule: 'prefer-strict-literal-const', source: 'const routes = { home: { path: "/" } }\n'})
})
test('prefer-readonly-types', () => {
	return expectRule({rule: 'prefer-readonly-types', source: 'type Props = { tags: string[] }\n'})
})
test('prefer-readonly-types reports non-ref current properties', () => {
	return expectRule({rule: 'prefer-readonly-types', source: 'type State = { current: string }\n'})
})
test('prefer-undefined-over-null', () => {
	return expectRule({rule: 'prefer-undefined-over-null', source: 'type Props = { readonly value: string | null }\n'})
})
test('prefer-undefined-over-null allows react ref null', () => {
	const rules = Array.map(
		analyzeTypedText('sample.tsx', 'import {useRef} from "react"\nconst elementRef = useRef<HTMLDivElement>(null)\n'),
		diagnostic => diagnostic.rule
	)
	expect(rules).not.toContain('prefer-undefined-over-null')
	expect(rules).not.toContain('no-redundant-generic-type-argument')
})
test('prefer-undefined-over-null reports react ref undefined', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		typed: true,
		filePath: 'sample.tsx',
		source: 'import {useRef} from "react"\nconst elementRef = useRef<HTMLDivElement>(undefined)\n'
	})
})
test('prefer-undefined-over-null reports react component null returns', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		filePath: 'sample.tsx',
		source: 'function Empty() { return null }\n'
	})
})
test('prefer-undefined-over-null reports non-ref current properties', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		source: 'type Cursor = { readonly current: string | null }\n'
	})
})
test('prefer-undefined-over-null reports non-ref current assignments', () => {
	return expectRule({
		rule: 'prefer-undefined-over-null',
		typed: true,
		source: 'function reset(state: { readonly current: string | undefined }) { state.current = null }\n'
	})
})
test('prefer-optional-property reports undefined property unions', () => {
	return expectRule({
		rule: 'prefer-optional-property',
		source: 'type Props = { readonly activeProject: GitProject | undefined }\n'
	})
})
test('no-any', () => {
	return expectRule({rule: 'no-any', source: 'function parse(value: any) { return value }\n'})
})
test('no-redundant-type-annotation', () => {
	return expectRule({rule: 'no-redundant-type-annotation', typed: true, source: 'const value: string = "value"\n'})
})
test('no-redundant-type-annotation reports multi-statement function return annotations', () => {
	return expectRule({
		rule: 'no-redundant-type-annotation',
		typed: true,
		source: 'function label(value: string): string { if (value) return value; return "fallback" }\n'
	})
})
test('no-redundant-type-annotation allows recursive function return annotations', () => {
	const diagnostics = analyzeTypedText(
		'sample.ts',
		'function loop(value: number): number { return value <= 0 ? 0 : loop(value - 1) }\n'
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).not.toContain('no-redundant-type-annotation')
})
test('reports callback parameter annotation for concrete named contextual type', () => {
	const diagnostics = analyzeTypedText(
		'sample.ts',
		'type User = { readonly name: string }\ndeclare function onUser(callback: (user: User) => void): void\nonUser((user: User) => user.name)\n'
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).toContain('no-callback-parameter-type-annotation')
})
test('no-redundant-generic-type-argument', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'function identity<T>(value: T) { return value }\nconst value = identity<string>("value")\n'
	})
})
test('no-redundant-generic-type-argument reports local use-prefixed functions', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'function useValue<T>(value: T) { return value }\nconst value = useValue<string>("value")\n'
	})
})
test('no-redundant-generic-type-argument allows react useState type arguments', () => {
	const diagnostics = analyzeTypedText(
		'sample.tsx',
		'import {useState} from "react"\nconst [mode, setMode] = useState<"on" | "off">("off")\nsetMode\nmode\n'
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).not.toContain('no-redundant-generic-type-argument')
})
test('no-redundant-generic-type-argument reports shadowed effect module names', () => {
	return expectRule({
		rule: 'no-redundant-generic-type-argument',
		typed: true,
		source: 'const Array = { first<T>(value: T) { return value } }\nconst value = Array.first<string>("value")\n'
	})
})
test('no-unnecessary-type-constraint', () => {
	return expectRule({
		rule: 'no-unnecessary-type-constraint',
		source: 'function identity<T extends unknown>(value: T) { return value }\n'
	})
})
test('no-accessor-type-alias reports schema type re-export aliases', () => {
	return expectRule({
		rule: 'no-accessor-type-alias',
		source:
			'import {TerminalEvent as TerminalEventSchema} from "@ai-toolkit/terminal/schema"\nexport type TerminalEvent = typeof TerminalEventSchema.Type\n'
	})
})
test('no-accessor-type-alias allows companion type aliases', () => {
	const diagnostics = analyzeTypedText(
		'sample.ts',
		'export type TerminalEvent = typeof TerminalEvent.Type\nexport const TerminalEvent = { Type: "" }\n'
	)
	expect(Array.map(diagnostics, diagnostic => diagnostic.rule)).not.toContain('no-accessor-type-alias')
})
test('no-accessor-type-alias reports exported runtime namespaces', () => {
	return expectRule({
		rule: 'no-accessor-type-alias',
		source: 'export namespace DevTools { export function Navigation() { return null } }\n'
	})
})
test('no-redundant-type-system-check', () => {
	return expectRule({
		rule: 'no-redundant-type-system-check',
		typed: true,
		source: 'function view(props: { readonly name: string }) { return props.name ?? "anonymous" }\n'
	})
})
test('no-floating-type-contract', () => {
	return expectRule({
		rule: 'no-floating-type-contract',
		source: 'type Input = { readonly name: string }\nfunction create(input: Input) { return input.name }\n'
	})
})
test('no-floating-type-contract reports small repeated unions', () => {
	return expectRule({
		rule: 'no-floating-type-contract',
		source:
			'type ActionPaletteMode = "create-thread" | "create-worktree"\ndeclare function useMode(mode: ActionPaletteMode): ActionPaletteMode\nconst mode = useMode("create-thread")\n'
	})
})
test('no-floating-type-contract reports small repeated object aliases', () => {
	return expectRule({
		rule: 'no-floating-type-contract',
		source:
			'type TerminalEvent = { readonly data: string; readonly type: "data" | "snapshot" }\ndeclare function send(event: TerminalEvent): void\ndeclare function receive(): TerminalEvent\n'
	})
})
test('no-floating-type-contract reports small repeated interfaces', () => {
	return expectRule({
		rule: 'no-floating-type-contract',
		source:
			'interface Subscriber { readonly queue: string }\ndeclare function add(subscriber: Subscriber): void\ndeclare function remove(subscriber: Subscriber): void\n'
	})
})
test('no-broad-literal-annotation', () => {
	return expectRule({
		rule: 'no-broad-literal-annotation',
		source: 'const routes: Record<string, { readonly path: string }> = { home: { path: "/" } }\n'
	})
})
test('no-effect-type-erasure', () => {
	return expectRule({
		rule: 'no-effect-type-erasure',
		source: 'import {Effect} from "effect"\ntype Program = Effect.Effect<string>\n'
	})
})
