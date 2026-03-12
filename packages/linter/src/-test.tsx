import {Effect} from 'effect'

// biome-ignore lint: packages/linter/src/no-react-type-imports.grit
import type {ReactNode} from 'react'
import {useCallback, useEffect, useImperativeHandle, useMemo} from 'react'

// no-type-assertion
function test_type_assertion(value: unknown) {
	// biome-ignore lint: packages/linter/src/no-type-assertion.grit
	return value as string
}

// no-native-methods (array)
function test_array_native(arr: string[]) {
	// biome-ignore lint: packages/linter/src/no-native-methods.grit
	return arr.map(x => x)
}

// no-effect-gen-with-args
// biome-ignore lint: packages/linter/src/no-effect-gen-with-args.grit
const bad_gen_with_args = (name: string) => Effect.gen(function* () {})

// no-native-methods (string)
function test_string_trim(s: string) {
	// biome-ignore lint: packages/linter/src/no-native-methods.grit
	return s.trim()
}

// no-arg-destructuring
// biome-ignore lint: packages/linter/src/no-arg-destructuring.grit
function test_arg_destructuring({name}: {name: string}) {
	return name
}

// no-access-variables (property access)
function test_access(props: {user: {name: string}}) {
	// biome-ignore lint: packages/linter/src/no-access-variables.grit
	const name = props.user.name
	return name
}

// no-access-variables (variable alias)
function test_alias(db: unknown) {
	// biome-ignore lint: packages/linter/src/no-access-variables.grit
	const database = db
	return database
}

// no-simple-check-variables
function test_simple_check(role: string) {
	// biome-ignore lint: packages/linter/src/no-simple-check-variables.grit
	const isAdmin = role === 'admin'
	return isAdmin
}

// no-return-undefined-null
function test_return_null() {
	// biome-ignore lint: packages/linter/src/no-return-undefined-null.grit
	return null
}

// no-react-hooks (memoization)
function test_react_hooks() {
	// biome-ignore lint: packages/linter/src/no-react-hooks.grit
	useCallback(() => {}, [])
}

// no-arrow-for-named
// biome-ignore lint: packages/linter/src/no-arrow-for-named.grit
const bad_arrow_fn = (x: string) => x

// no-ternary-in-jsx
function test_ternary_null(show: boolean) {
	// biome-ignore lint: packages/linter/src/no-ternary-in-jsx.grit
	return show ? <div>hello</div> : null
}

// no-inline-style
function test_inline_style() {
	// biome-ignore lint: packages/linter/src/no-inline-style.grit
	return <div style={{color: 'red'}}>hello</div>
}

// cn-classname
function test_cn_classname(active: boolean) {
	// biome-ignore lint: packages/linter/src/cn-classname.grit
	return <div className={active ? 'active' : 'inactive'}>hi</div>
}

// no-variable-type-annotation
// biome-ignore lint: packages/linter/src/no-variable-type-annotation.grit
const bad_annotation: string[] = []

// no-return-type-annotation - named function
// biome-ignore lint: packages/linter/src/no-return-type-annotation.grit
function bad_return_type(): string {
	return ''
}

// no-return-type-annotation - arrow function assigned to const
// biome-ignore lint: packages/linter/src/no-return-type-annotation.grit
const bad_arrow_return = (x: number): string => String(x)

// no-return-type-annotation - callback arrow function
// biome-ignore lint: packages/linter/src/no-return-type-annotation.grit
const arr = [1, 2, 3].map((x): string => String(x))

// no-typeof-window-undefined
function test_typeof_window() {
	// biome-ignore lint: packages/linter/src/no-typeof-window-undefined.grit
	if (typeof window === 'undefined') return null
}

// no-tailwind-class-variables
// biome-ignore lint: packages/linter/src/no-tailwind-class-variables.grit
const PANEL_CLASS = 'border border-border/70 bg-background/92'

// no-simple-function-variables (arrow)
// biome-ignore lint: packages/linter/src/no-simple-function-variables.grit
const clampUnit = (value: number) => Math.max(0, Math.min(0.999999, value))

// no-simple-function-variables (function expression)
// biome-ignore lint: packages/linter/src/no-simple-function-variables.grit
const clampUnit2 = function (value: number) {
	return Math.max(0, Math.min(0.999999, value))
}

// no-native-methods (split)
function test_split(str: string) {
	// biome-ignore lint: packages/linter/src/no-native-methods.grit
	return str.split(':')
}
