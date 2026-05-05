import {Array} from 'effect'

import {describe, expect, test} from 'bun:test'
import {StrictLinter} from '../index.ts'

function rulesFor(sourceText: string, filePath?: string) {
	return Array.map(StrictLinter.analyzeText(filePath ?? 'sample.ts', sourceText), diagnostic => diagnostic.rule)
}

describe('react-ui rules', () => {
	test('no-react-type-imports', () => {
		expect(rulesFor("import * as React from 'react'")).toContain('no-react-type-imports')
	})

	test('no-react-null-state', () => {
		expect(rulesFor('const [value, setValue] = useState<string | null>(null)', 'sample.tsx')).toContain(
			'no-react-null-state'
		)
	})

	test('cn-classname', () => {
		expect(rulesFor('<div className={active ? "text-red-500" : "text-blue-500"} />', 'sample.tsx')).toContain(
			'cn-classname'
		)
	})

	test('cn-classname for template conditional interpolation', () => {
		expect(rulesFor(`<div className={\`flex \${active ? "text-red-500" : ""}\`} />`, 'sample.tsx')).toContain(
			'cn-classname'
		)
	})

	test('cn-classname for template boolean interpolation', () => {
		expect(rulesFor(`<div className={\`flex \${active && "text-red-500"}\`} />`, 'sample.tsx')).toContain(
			'cn-classname'
		)
	})

	test('no-tailwind-class-variables', () => {
		expect(rulesFor("const className = 'flex items-center gap-2'")).toContain('no-tailwind-class-variables')
		expect(rulesFor('const css = `:host { display: block; }`')).not.toContain('no-tailwind-class-variables')
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

	test('no-import-alias for namespace imports', () => {
		expect(rulesFor("import * as EffectTypes from 'effect'")).toContain('no-import-alias')
	})

	test('allows namespace import matching module basename', () => {
		expect(rulesFor("import * as Schema from 'effect/Schema'")).not.toContain('no-import-alias')
	})

	test('no-import-alias for named imports', () => {
		expect(rulesFor("import {Schema as S} from 'effect'")).toContain('no-import-alias')
		expect(
			rulesFor("import {PatchDiff as PierrePatchDiff} from '@pierre/diffs/react'; export function PatchDiff() {}")
		).not.toContain('no-import-alias')
	})
})
