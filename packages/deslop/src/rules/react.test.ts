import {test} from 'bun:test'

import {expectNoRule, expectRule} from './test-utils.ts'

test('no-explicit-default-value reports false intrinsic boolean props', () => {
	return expectRule({
		rule: 'no-explicit-default-value',
		filePath: 'sample.tsx',
		source: 'function View() { return <button disabled={false} /> }\n'
	})
})

test('no-explicit-default-value allows component false boolean props', () => {
	return expectNoRule({
		rule: 'no-explicit-default-value',
		filePath: 'sample.tsx',
		source: 'function View() { return <Button disabled={false} /> }\n'
	})
})

test('prefer-arrow-callback reports function callbacks', () => {
	return expectRule({
		rule: 'prefer-arrow-callback',
		source: 'declare const names: readonly string[]\nnames.map(function (name) { return name.trim() })\n'
	})
})

test('prefer-arrow-callback allows recursive named callbacks', () => {
	return expectNoRule({
		rule: 'prefer-arrow-callback',
		source: 'declare function schedule(callback: () => void): void\nschedule(function tick() { schedule(tick) })\n'
	})
})

test('no-tailwind-class-indirection reports class string variables', () => {
	return expectRule({
		rule: 'no-tailwind-class-indirection',
		filePath: 'sample.tsx',
		source:
			'const buttonClass = "flex items-center gap-2"\nfunction Button() { return <button className={buttonClass} /> }\n'
	})
})

test('no-manual-memoization reports React memo helpers', () => {
	return expectRule({
		rule: 'no-manual-memoization',
		filePath: 'sample.tsx',
		source:
			'declare function useMemo<T>(callback: () => T, deps: readonly unknown[]): T\nconst value = useMemo(() => 1, [])\n'
	})
})

test('no-forward-ref reports forwardRef wrappers', () => {
	return expectRule({
		rule: 'no-forward-ref',
		filePath: 'sample.tsx',
		source: 'declare function forwardRef(value: unknown): unknown\nconst Input = forwardRef(() => null)\n'
	})
})

test('no-use-state-lazy-initializer reports lazy useState callbacks', () => {
	return expectRule({
		rule: 'no-use-state-lazy-initializer',
		filePath: 'sample.tsx',
		typed: true,
		source: 'import {useState} from "react"\nfunction View() { const state = useState(() => "Ada"); return state[0] }\n'
	})
})

test('prefer-hook-variable reports inline hook calls', () => {
	return expectRule({
		rule: 'prefer-hook-variable',
		filePath: 'sample.tsx',
		source: 'declare function useUser(): string\nfunction View() { return <Provider value={useUser()} /> }\n'
	})
})

test('no-jsx-variable reports JSX stored in locals', () => {
	return expectRule({
		rule: 'no-jsx-variable',
		filePath: 'sample.tsx',
		source: 'function View() { const content = <Content />; return content }\n'
	})
})

test('no-property-mutation-outside-ref-current reports property writes', () => {
	return expectRule({
		rule: 'no-property-mutation-outside-ref-current',
		filePath: 'sample.tsx',
		source: 'function rename(user: { name: string }) { user.name = "Ada" }\n'
	})
})

test('no-property-mutation-outside-ref-current allows ref.current writes', () => {
	return expectNoRule({
		rule: 'no-property-mutation-outside-ref-current',
		filePath: 'sample.tsx',
		typed: true,
		source:
			'import {useRef} from "react"\nfunction View() { const nameRef = useRef("Grace"); nameRef.current = "Ada"; return nameRef.current }\n'
	})
})
