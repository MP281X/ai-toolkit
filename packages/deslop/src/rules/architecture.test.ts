import {test} from 'bun:test'
import {expectRule} from './test-utils.ts'

test('no-type-only-file', () => {
	return expectRule({rule: 'no-type-only-file', source: 'export type User = { readonly name: string }\n'})
})
test('no-fake-public-export', () => {
	return expectRule({rule: 'no-fake-public-export', source: 'export function helper(value: string) { return value }\n'})
})
test('prefer-node-subpath-import', () => {
	return expectRule({rule: 'prefer-node-subpath-import', source: 'import {readFile} from "fs"\nreadFile\n'})
})
test('no-internal-barrel-import', () => {
	return expectRule({rule: 'no-internal-barrel-import', source: 'import {x} from "./feature/index"\nx\n'})
})
test('no-plain-class', () => {
	return expectRule({rule: 'no-plain-class', source: 'class User { readonly name = "Ada" }\n'})
})
test('no-re-export', () => {
	return expectRule({
		rule: 'no-re-export',
		source: 'export {architectureRules} from "./architecture.ts"\n',
		filePath: 'src/rules/helpers.ts'
	})
})
