import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-destructuring reports object binding aliases', () =>
	expectRule({
		rule: 'no-destructuring',
		source: 'function greet(user: { readonly name: string }) { const { name } = user; return name }\n'
	}))

test('no-destructuring allows tuple binding', () =>
	expectNoRule({
		rule: 'no-destructuring',
		typed: true,
		source: 'const pair: readonly [string, number] = ["Ada", 1]\nconst [name, count] = pair\n'
	}))

test('no-single-use-local-binding reports one-use aliases', () =>
	expectRule({
		rule: 'no-single-use-local-binding',
		source: 'function greet(user: { readonly name: string }) { const name = user.name; return name }\n'
	}))

test('no-single-use-local-binding reports common names by local scope', () =>
	expectRule({
		rule: 'no-single-use-local-binding',
		source:
			'import {Effect, Terminal} from "effect"\nconst other = terminal => terminal\nconst program = Effect.gen(function* () { const terminal = yield* Terminal.Terminal; yield* terminal.display("ready") })\n'
	}))

test('no-single-use-local-binding allows hook results to stay named', () =>
	expectNoRule({
		rule: 'no-single-use-local-binding',
		filePath: 'sample.tsx',
		source: 'import {useState} from "react"\nfunction View() { const state = useState("Ada"); return state[0] }\n'
	}))

test('no-pipe-method reports property pipe calls', () =>
	expectRule({
		rule: 'no-pipe-method',
		source:
			'declare const program: { pipe: (f: (value: string) => number) => number }\nconst value = program.pipe(value => value.length)\n'
	}))

test('no-simple-local-binding reports cheap boolean aliases', () =>
	expectRule({
		rule: 'no-simple-local-binding',
		source: 'function isReady(status: string) { const ready = status === "ready"; return ready }\n'
	}))

test('no-simple-local-binding reports small literal containers', () =>
	expectRule({
		rule: 'no-simple-local-binding',
		source: 'const values = ["a", "b"]\nfunction read() { return values }\n'
	}))

test('prefer-pipe-for-transform-sequences reports linear temporary chains', () =>
	expectRule({
		rule: 'prefer-pipe-for-transform-sequences',
		source:
			'import {Array} from "effect"\nfunction names(users: readonly { readonly name: string }[]) { const names = Array.map(users, user => user.name); const upper = Array.map(names, name => name.toUpperCase()); return upper }\n'
	}))

test('prefer-flow-for-pipe-callback reports callbacks that only pipe the parameter', () =>
	expectRule({
		rule: 'prefer-flow-for-pipe-callback',
		source:
			'import {Effect, pipe, String} from "effect"\nconst program = Effect.map(value => pipe(value, String.trim, String.split(RegExp("\\\\s+"))))\n'
	}))

test('prefer-flow-for-pipe-callback allows callbacks that add behavior before pipe', () =>
	expectNoRule({
		rule: 'prefer-flow-for-pipe-callback',
		source:
			'import {Effect, pipe, String} from "effect"\nconst program = Effect.map(value => pipe(value + "!", String.trim))\n'
	}))

test('no-vacuous-abstraction reports forwarding helpers', () =>
	expectRule({
		rule: 'no-vacuous-abstraction',
		source:
			'declare function parse(input: unknown): string\nfunction parseUser(input: unknown) { return parse(input) }\n'
	}))

test('no-vacuous-abstraction reports facade objects', () =>
	expectRule({
		rule: 'no-vacuous-abstraction',
		source: 'const read = () => 1\nconst write = () => 2\nconst Api = { read, write }\n'
	}))

test('no-vacuous-abstraction reports duplicate helper bodies', () =>
	expectRule({
		rule: 'no-vacuous-abstraction',
		source:
			'function trimName(name: string) { return name.trim() }\nfunction cleanName(name: string) { return name.trim() }\n'
	}))
