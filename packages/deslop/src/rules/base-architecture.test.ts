import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-deprecated-api reports JSDoc deprecated symbols', () =>
	expectRule({
		rule: 'no-deprecated-api',
		source: '/** @deprecated use readNew */\nfunction readOld() { return 1 }\nconst value = readOld()\n',
		typed: true
	}))

test('no-plain-class reports classes without framework semantics', () =>
	expectRule({
		rule: 'no-plain-class',
		source: 'class User { readonly name = "Ada" }\n'
	}))

test('no-plain-class allows classes with extends clauses', () =>
	expectNoRule({
		rule: 'no-plain-class',
		source: 'class User extends BaseUser {}\n'
	}))
