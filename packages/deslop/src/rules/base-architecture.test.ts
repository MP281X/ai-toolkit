import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-local-namespace-import reports local namespace imports', () =>
	expectRule({
		rule: 'no-local-namespace-import',
		source: 'import * as Utils from "./utils.ts"\nUtils.read()\n'
	}))

test('no-default-export-except-config reports default exports in source files', () =>
	expectRule({
		rule: 'no-default-export-except-config',
		source: 'export default function Button() {}\n'
	}))

test('no-default-export-except-config allows config file defaults', () =>
	expectNoRule({
		rule: 'no-default-export-except-config',
		filePath: 'tool.config.ts',
		source: 'export default { name: "tool" }\n'
	}))

test('no-deprecated-api reports JSDoc deprecated symbols', () =>
	expectRule({
		rule: 'no-deprecated-api',
		typed: true,
		source: '/** @deprecated use readNew */\nfunction readOld() { return 1 }\nconst value = readOld()\n'
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
