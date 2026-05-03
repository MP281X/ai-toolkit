import {Array, pipe} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string, filePath = 'sample.ts') {
	return pipe(
		StrictLinter.analyzeText(filePath, sourceText),
		Array.map(diagnostic => diagnostic.rule)
	)
}

describe('react-ui rules', () => {
	test('no-react-type-imports', () => {
		expect(rulesFor("import * as React from 'react'")).toContain('no-react-type-imports')
	})

	test('cn-classname', () => {
		expect(rulesFor('<div className={active ? "text-red-500" : "text-blue-500"} />', 'sample.tsx')).toContain(
			'cn-classname'
		)
	})

	test('no-tailwind-class-variables', () => {
		expect(rulesFor("const className = 'flex items-center gap-2'")).toContain('no-tailwind-class-variables')
	})

	test('no-jsx-wrapper-component', () => {
		expect(rulesFor('function Button(props) { return <Primitive.Button {...props} /> }', 'sample.tsx')).toContain(
			'no-jsx-wrapper-component'
		)
	})

	test('no-render-prop-element', () => {
		expect(rulesFor('<Dialog.Trigger render={<Button />} />', 'sample.tsx')).toContain('no-render-prop-element')
	})

	test('no-component-namespace-object', () => {
		expect(rulesFor('const Dialog = { Trigger: () => <button /> }', 'sample.tsx')).toContain(
			'no-component-namespace-object'
		)
	})

	test('no-namespace-import-alias', () => {
		expect(rulesFor("import * as Schema from 'effect/Schema'")).toContain('no-namespace-import-alias')
	})
})
