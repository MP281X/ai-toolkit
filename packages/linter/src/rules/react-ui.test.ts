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

	test('no-avoidable-use-effect for mount focus', () => {
		expect(rulesFor('useEffect(() => { inputRef.current?.focus() }, [])')).toContain('no-avoidable-use-effect')
	})

	test('no-avoidable-use-effect for boolean-gated focus', () => {
		expect(rulesFor('useLayoutEffect(() => { if (editing) inputRef.current?.focus() }, [editing])')).toContain(
			'no-avoidable-use-effect'
		)
	})

	test('no-avoidable-use-effect for ref handoff', () => {
		expect(
			rulesFor(
				'useEffect(() => { props.editorRef.current = editor; return () => { props.editorRef.current = null } }, [])'
			)
		).toContain('no-avoidable-use-effect')
	})

	test('no-avoidable-use-effect for derived state', () => {
		expect(
			rulesFor(
				'const [, setName] = useState(""); const [, setCount] = useState(0); useEffect(() => { setName(props.name); setCount(props.items.length) }, [props])'
			)
		).toContain('no-avoidable-use-effect')
	})

	test('no-avoidable-use-effect ignores external subscriptions', () => {
		expect(rulesFor('useEffect(() => window.addEventListener("resize", resize), [resize])')).not.toContain(
			'no-avoidable-use-effect'
		)
	})

	test('no-avoidable-use-effect ignores cleanup subscriptions', () => {
		expect(
			rulesFor(
				'useEffect(() => editor.registerCommand(KEY_ENTER_COMMAND, handler, COMMAND_PRIORITY_LOW), [editor, handler])'
			)
		).not.toContain('no-avoidable-use-effect')
	})
})
