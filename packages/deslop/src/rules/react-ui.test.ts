import {test} from 'bun:test'
import {expectRule} from './test-utils.ts'

test('prefer-function-declaration', () => {
	return expectRule({
		rule: 'prefer-function-declaration',
		source: 'const normalize = (value: string) => value.trim()\n'
	})
})
test('prefer-arrow-callback', () => {
	return expectRule({
		rule: 'prefer-arrow-callback',
		source: 'declare const values: ReadonlyArray<string>\nvalues.map(function (value) { return value })\n'
	})
})
test('no-react-manual-memoization', () => {
	return expectRule({
		rule: 'no-react-manual-memoization',
		source:
			'declare function useMemo<T>(callback: () => T, deps: readonly unknown[]): T\nconst value = useMemo(() => 1, [])\n'
	})
})
test('no-react-forward-ref', () => {
	return expectRule({
		rule: 'no-react-forward-ref',
		source: 'declare function forwardRef(value: unknown): unknown\nconst Component = forwardRef(() => null)\n',
		filePath: 'sample.tsx'
	})
})
test('no-react-use-state-lazy-initializer', () => {
	return expectRule({
		rule: 'no-react-use-state-lazy-initializer',
		source:
			'import {useState} from "react"\nfunction Component() { const [subscriptionId] = useState(() => crypto.randomUUID()); return subscriptionId }\n',
		filePath: 'sample.tsx'
	})
})
test('prefer-composition-over-render-branching', () => {
	return expectRule({
		rule: 'prefer-composition-over-render-branching',
		source: 'function View(props: { readonly active: boolean }) { return props.active ? <Active /> : <Inactive /> }\n',
		filePath: 'sample.tsx'
	})
})
test('no-property-mutation-outside-ref-current', () => {
	return expectRule({
		rule: 'no-property-mutation-outside-ref-current',
		source: 'function update(state: { value: number }) { state.value = 1 }\n',
		filePath: 'sample.tsx'
	})
})
test('no-property-mutation-outside-ref-current reports non-component static attachments', () => {
	return expectRule({
		rule: 'no-property-mutation-outside-ref-current',
		typed: true,
		source: 'function Config() { return null }\nConfig.Value = 1\n',
		filePath: 'sample.tsx'
	})
})
test('no-tailwind-class-variables', () => {
	return expectRule({rule: 'no-tailwind-class-variables', source: 'const button = "flex rounded bg-blue-500"\n'})
})
