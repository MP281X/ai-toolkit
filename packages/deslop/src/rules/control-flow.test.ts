import {test} from 'bun:test'
import {expectRule} from './test-utils.ts'

test('prefer-match-for-pattern-branching', () => {
	return expectRule({
		rule: 'prefer-match-for-pattern-branching',
		source:
			'type Event = { readonly _tag: "created" } | { readonly _tag: "deleted" }\nfunction view(event: Event) { switch (event._tag) { case "created": return "Created"; case "deleted": return "Deleted" } }\n'
	})
})
test('require-as-const-match-output-literals', () => {
	return expectRule({
		rule: 'require-as-const-match-output-literals',
		source: 'import {Match} from "effect"\nconst view = Match.tag("created", () => "Created")\n'
	})
})
test('prefer-early-return-over-else', () => {
	return expectRule({
		rule: 'prefer-early-return-over-else',
		source: 'function view(value: boolean) { if (value) { return 1 } else { return 2 } }\n'
	})
})
test('prefer-match-for-reassignment-selection', () => {
	return expectRule({
		rule: 'prefer-match-for-reassignment-selection',
		source:
			'function mode(config: { readonly unstaged: boolean; readonly full: boolean }) { let mode = "changed"; if (config.unstaged) mode = "unstaged"; if (config.full) mode = "full"; return mode }\n'
	})
})
test('prefer-minimal-if-braces', () => {
	return expectRule({
		rule: 'prefer-minimal-if-braces',
		source: 'function view(value: boolean) { if (value) { return 1 } return 2 }\n'
	})
})
test('no-dynamic-imports', () => {
	return expectRule({rule: 'no-dynamic-imports', source: 'const module = import("./feature")\n'})
})
test('no-regex-literal', () => {
	return expectRule({rule: 'no-regex-literal', source: 'const pattern = /abc/g\n'})
})
