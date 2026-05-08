import {test} from 'bun:test'
import {expectRule} from './test-utils.ts'

test('no-destructuring-except-react-hook-tuples', () => {
	return expectRule({
		rule: 'no-destructuring-except-react-hook-tuples',
		source:
			'function view(props: { readonly user: { readonly name: string } }) { const { user } = props; return user.name }\n'
	})
})
test('no-access-alias', () => {
	return expectRule({
		rule: 'no-access-alias',
		source:
			'function view(props: { readonly user: { readonly name: string } }) { const name = props.user.name; return name }\n'
	})
})
test('no-access-alias for repeated access variables', () => {
	return expectRule({
		rule: 'no-access-alias',
		source:
			'function view(node: { readonly arguments: readonly string[] }) { const input = node.arguments[0]; return input + input }\n'
	})
})
test('no-access-alias reports shadowed atom constructor names', () => {
	return expectRule({
		rule: 'no-access-alias',
		typed: true,
		source:
			'const Atom = { make(value: number) { return { value } } }\nconst valueAtom = Atom.make(1)\nfunction read() { return valueAtom }\n'
	})
})
test('no-boolean-expression-alias', () => {
	return expectRule({
		rule: 'no-boolean-expression-alias',
		source: 'function view(status: string) { const active = status === "active"; return active }\n'
	})
})
test('no-config-objects', () => {
	return expectRule({
		rule: 'no-config-objects',
		source: 'const cases = [{ rule: "one", source: "const value = 1" }]\n'
	})
})
test('no-inlineable-literal-constant', () => {
	return expectRule({
		rule: 'no-inlineable-literal-constant',
		source: 'const values = ["a", "b"]\nfunction read() { return values }\n'
	})
})
test('prefer-pipe-for-transform-sequences', () => {
	return expectRule({
		rule: 'prefer-pipe-for-transform-sequences',
		source:
			'import {Array} from "effect"\nfunction names(users: ReadonlyArray<{ readonly name: string }>) { const mapped = Array.map(users, user => user.name); const sorted = Array.sort(mapped, String.localeCompare); return sorted }\n'
	})
})
test('no-trivial-local-helper pipe', () => {
	return expectRule({
		rule: 'no-trivial-local-helper',
		source:
			'import {Array, pipe} from "effect"\nfunction names(values: readonly string[]) { return pipe(values, Array.map(value => value)) }\n'
	})
})
test('no-trivial-local-helper forwarding wrapper', () => {
	return expectRule({
		rule: 'no-trivial-local-helper',
		source:
			'declare function parseInput(input: unknown): string\nfunction parseUser(input: unknown) { return parseInput(input) }\n'
	})
})
test('no-trivial-local-helper near use', () => {
	return expectRule({
		rule: 'no-trivial-local-helper',
		source: 'function value() { return 1 }\nconst result = value()\n'
	})
})
test('no-trivial-local-helper predicate', () => {
	return expectRule({
		rule: 'no-trivial-local-helper',
		source: 'function isActive(status: string) { return status === "active" }\n'
	})
})
test('no-equivalent-helper-duplicates', () => {
	return expectRule({
		rule: 'no-equivalent-helper-duplicates',
		source: 'function one(value: string) { return value.trim() }\nfunction two(value: string) { return value.trim() }\n'
	})
})
test('no-constant-variation-parameter', () => {
	return expectRule({
		rule: 'no-constant-variation-parameter',
		source: 'function view(label = "Save") { return label }\n'
	})
})
test('no-facade-object', () => {
	return expectRule({
		rule: 'no-facade-object',
		source: 'const read = () => 1\nconst write = () => 2\nconst Api = { read, write }\n'
	})
})
test('no-single-variant-abstraction', () => {
	return expectRule({
		rule: 'no-single-variant-abstraction',
		source: 'type Event = | { readonly _tag: "created" }\nconst event = "created"\n'
	})
})
test('no-single-implementation-abstraction', () => {
	return expectRule({
		rule: 'no-single-implementation-abstraction',
		source: 'interface Repo { get(id: string): string }\nclass UserRepo { get(id: string) { return id } }\n'
	})
})
