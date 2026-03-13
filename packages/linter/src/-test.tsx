// biome-ignore-all lint/correctness/useHookAtTopLevel: test file
// biome-ignore-all lint/style/noRestrictedGlobals: test file
import {Effect} from 'effect'

// biome-ignore lint/plugin: react types
import type {ReactNode} from 'react'
import {memo, useCallback, useImperativeHandle, useMemo} from 'react'

function test_type_assertion(value: unknown) {
	// biome-ignore lint/plugin: type assertion
	return value as string
}

function test_array_native(arr: string[]) {
	// biome-ignore lint/plugin: native methods
	return arr.map(x => x)
}

// biome-ignore lint/plugin: effect gen args
const bad_gen_with_args = (name: string) => Effect.gen(function* () {})

function test_string_trim(s: string) {
	// biome-ignore lint/plugin: native methods
	return s.trim()
}

// biome-ignore lint/plugin: arg destructuring
function test_arg_destructuring({name}: {name: string}) {
	return name
}

function test_access(props: {user: {name: string}}) {
	// biome-ignore lint/plugin: access variable
	const name = props.user.name
	return name
}

function test_alias(db: unknown) {
	// biome-ignore lint/plugin: access variable
	const database = db
	return database
}

function test_simple_check(role: string) {
	// biome-ignore lint/plugin: check variable
	const isAdmin = role === 'admin'
	return isAdmin
}

function test_return_null() {
	// biome-ignore lint/plugin: return null
	return null
}

function test_react_hooks() {
	// biome-ignore lint/plugin: react hooks
	useCallback(() => {}, [])
}

// biome-ignore lint/plugin: react hooks
const MemoComponent = memo(() => <div>hello</div>)

// biome-ignore lint/plugin: arrow function
const bad_arrow_fn = (x: string) => x

// biome-ignore lint/plugin: function expression
const bad_fn_expr = function (x: string) {
	return x
}

// biome-ignore lint/plugin: function expression
const bad_named_fn_expr = function bad_named_fn_expr(x: string) {
	return x
}

function test_ternary_null(show: boolean) {
	// biome-ignore lint/plugin: ternary jsx
	return show ? <div>hello</div> : null
}

function test_inline_style() {
	// biome-ignore lint/plugin: inline style
	return <div style={{color: 'red'}}>hello</div>
}

function test_cn_classname(active: boolean) {
	// biome-ignore lint/plugin: cn classname
	return <div className={active ? 'active' : 'inactive'}>hi</div>
}

// biome-ignore lint/plugin: type annotation
const bad_annotation: string[] = []

// biome-ignore lint/plugin: return type
function bad_return_type(): string {
	return ''
}

// biome-ignore lint/plugin: return type
const bad_arrow_return = (x: number): string => String(x)

// biome-ignore lint/plugin: return type
const arr = [1, 2, 3].map((x): string => String(x))

function test_typeof_window() {
	// biome-ignore lint/plugin: typeof window
	if (typeof window === 'undefined') return null
}

// biome-ignore lint/plugin: tailwind class
const PANEL_CLASS = 'border border-border/70 bg-background/92'

// biome-ignore lint/plugin: simple function
const clampUnit = (value: number) => Math.max(0, Math.min(0.999999, value))

// biome-ignore lint/plugin: simple function
const clampUnit2 = function (value: number) {
	return Math.max(0, Math.min(0.999999, value))
}

function test_split(str: string) {
	// biome-ignore lint/plugin: native methods
	return str.split(':')
}

// biome-ignore lint/plugin: primitive const
const PRIMITIVE_STRING = 'hello'

// biome-ignore lint/plugin: primitive const
const PRIMITIVE_NUMBER = 42

// biome-ignore lint/plugin: primitive const
const PRIMITIVE_BOOLEAN = true

// biome-ignore lint/plugin: primitive const
const AS_CONST_STRING = 'value' as const

// biome-ignore lint/plugin: primitive const
const AS_CONST_NUMBER = 42 as const

// This should NOT be flagged - it's an object
const VALID_OBJECT = {foo: 'bar'}

// This should NOT be flagged - it's an array
const VALID_ARRAY = [1, 2, 3]

// This should NOT be flagged - it's a function
// biome-ignore lint/plugin: arrow function
const VALID_FUNCTION = () => 'hello'

// biome-ignore lint/plugin: effect fail
const bad_fail = Effect.fail(new Error('test'))

// biome-ignore lint/plugin: effect succeed
const bad_succeed = Effect.succeed('value')
