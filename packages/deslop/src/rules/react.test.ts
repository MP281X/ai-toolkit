import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-explicit-default-value reports false intrinsic boolean props', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-explicit-default-value',
		source: 'function View() { return <button disabled={false} /> }\n'
	})
})

test('no-explicit-default-value allows component false boolean props', () => {
	expectNoRule({
		filePath: 'sample.tsx',
		rule: 'no-explicit-default-value',
		source: 'function View() { return <Button disabled={false} /> }\n'
	})
})

test('prefer-arrow-callback reports function callbacks', () => {
	expectRule({
		rule: 'prefer-arrow-callback',
		source: 'declare const names: readonly string[]\nnames.map(function (name) { return name.trim() })\n'
	})
})

test('prefer-arrow-callback allows recursive named callbacks', () => {
	expectNoRule({
		rule: 'prefer-arrow-callback',
		source: 'declare function schedule(callback: () => void): void\nschedule(function tick() { schedule(tick) })\n'
	})
})

test('no-tailwind-class-indirection reports class string variables', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-tailwind-class-indirection',
		source:
			'const buttonClass = "flex items-center gap-2"\nfunction Button() { return <button className={buttonClass} /> }\n'
	})
})

test('no-manual-memoization reports React memo helpers', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-manual-memoization',
		source:
			'declare function useMemo<T>(callback: () => T, deps: readonly unknown[]): T\nconst value = useMemo(() => 1, [])\n'
	})
})

test('no-forward-ref reports forwardRef wrappers', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-forward-ref',
		source: 'declare function forwardRef(value: unknown): unknown\nconst Input = forwardRef(() => null)\n'
	})
})

test('no-use-state-lazy-initializer reports lazy useState callbacks', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-use-state-lazy-initializer',
		source:
			'import {useState} from "react"\nfunction View() { const state = useState(() => "Ada"); return state[0] }\n',
		typed: true
	})
})

test('prefer-hook-variable reports inline hook calls', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'prefer-hook-variable',
		source: 'declare function useUser(): string\nfunction View() { return <Provider value={useUser()} /> }\n'
	})
})

test('no-jsx-variable reports JSX stored in locals', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-jsx-variable',
		source: 'function View() { const content = <Content />; return content }\n'
	})
})

test('no-property-mutation-outside-ref-current reports property writes', () => {
	expectRule({
		filePath: 'sample.tsx',
		rule: 'no-property-mutation-outside-ref-current',
		source: 'function rename(user: { name: string }) { user.name = "Ada" }\n'
	})
})

test('no-property-mutation-outside-ref-current allows ref.current writes', () => {
	expectNoRule({
		filePath: 'sample.tsx',
		rule: 'no-property-mutation-outside-ref-current',
		source:
			'import {useRef} from "react"\nfunction View() { const nameRef = useRef("Grace"); nameRef.current = "Ada"; return nameRef.current }\n',
		typed: true
	})
})
