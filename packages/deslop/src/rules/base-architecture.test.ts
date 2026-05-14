import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-local-namespace-import reports local namespace imports', () => {
	expectRule({
		rule: 'no-local-namespace-import',
		source: 'import * as Utils from "./utils.ts"\nUtils.read()\n'
	})
})

test('no-plain-class reports classes without framework semantics', () => {
	expectRule({
		rule: 'no-plain-class',
		source: 'class User { readonly name = "Ada" }\n'
	})
})

test('no-plain-class allows classes with extends clauses', () => {
	expectNoRule({
		rule: 'no-plain-class',
		source: 'class User extends BaseUser {}\n'
	})
})
