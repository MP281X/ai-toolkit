// biome-ignore-all lint/correctness/useHookAtTopLevel: test file
// biome-ignore-all lint/style/noRestrictedGlobals: test file
import {Array, Effect, Match, pipe, Schema, String} from 'effect'

// biome-ignore lint/plugin: react types
import type {ReactNode} from 'react'
import {forwardRef, memo, useCallback} from 'react'

export class TestError extends Schema.TaggedErrorClass<TestError>()('TestError', {
	cause: Schema.optional(Schema.Defect)
}) {}

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

// biome-ignore lint/plugin: effect gen args
function bad_gen_named(name: string) {
	return Effect.gen(function* () {
		return name
	})
}

const valid_gen = Effect.gen(function* () {
	return 'ok'
})

const valid_fn_untraced = Effect.fnUntraced(function* (name: string) {
	return name
})

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

function valid_direct_access(props: {user: {name: string}}) {
	return props.user.name
}

function valid_alias_from_call(name: string) {
	const result = globalThis.String(name)
	return result
}

function test_simple_check(role: string) {
	// biome-ignore lint/plugin: check variable
	const isAdmin = role === 'admin'
	return isAdmin
}

function valid_inline_check(role: string) {
	if (role === 'admin') return 'admin'

	return 'user'
}

function valid_non_trivial_check(role: string) {
	const isPrivileged = role === 'admin' || role === 'owner'
	return isPrivileged
}

function test_return_null() {
	// biome-ignore lint/plugin: return null
	return null
}

function test_return_undefined() {
	// biome-ignore lint/complexity/noUselessUndefined: test file
	// biome-ignore lint/plugin: return undefined
	return undefined
}

function test_react_hooks() {
	// biome-ignore lint/plugin: react compiler antipattern
	useCallback(() => {}, [])
}

// biome-ignore lint/plugin: react compiler antipattern
const MemoComponent = memo(() => <div>hello</div>)

// biome-ignore lint/plugin: simple function
const bad_arrow_fn = (x: string) => x

// biome-ignore lint/plugin: simple function
const bad_fn_expr = function (x: string) {
	return x
}

// biome-ignore lint/plugin: simple function
const bad_named_fn_expr = function bad_named_fn_expr(x: string) {
	return x
}

// biome-ignore lint/plugin: simple function
const bad_block_arrow_fn = (x: string) => {
	return x
}

// biome-ignore lint/plugin: named function
const bad_named_block_arrow = (x: string) => {
	if (x) return x

	return 'fallback'
}

// biome-ignore lint/plugin: named function
export const bad_exported_arrow = (x: string) => x

function test_ternary_null(show: boolean) {
	// biome-ignore lint/plugin: ternary jsx
	return show ? <div>hello</div> : null
}

function test_inline_style() {
	return <div style={{color: 'red'}}>hello</div>
}

function test_cn_classname(active: boolean) {
	// biome-ignore lint/plugin: cn classname
	return <div className={active ? 'active' : 'inactive'}>hi</div>
}

function test_pipe_method() {
	// biome-ignore lint/plugin: pipe method
	return Match.value('active').pipe(Match.orElse(() => 'inactive'))
}

// biome-ignore lint/plugin: type annotation
const bad_annotation: string[] = []

// biome-ignore lint/plugin: return type
function bad_return_type(): string {
	return ''
}

// biome-ignore lint/plugin: return type
const bad_arrow_return = (x: number): string => globalThis.String(x)

// biome-ignore lint/plugin: return type
const arr = [1, 2, 3].map((x): string => globalThis.String(x))

function test_typeof_window() {
	// biome-ignore lint/plugin: typeof window
	if (typeof window === 'undefined') return null
}

// biome-ignore lint/plugin: tailwind class
const PANEL_CLASS = 'border border-border/70 bg-background/92'

// biome-ignore lint/plugin: tailwind class
const PANEL_THEME = {bar: 'bg-primary/20', border: 'border-border/60'}

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

function test_at(items: string[]) {
	// biome-ignore lint/plugin: native methods
	return items.at(-1)
}

function test_length_empty_string(value: string) {
	// biome-ignore lint/plugin: length check
	return value.length === 0
}

function test_length_non_empty_array(value: string[]) {
	// biome-ignore lint/plugin: length check
	return value.length > 0
}

function test_length_empty_array_reverse(value: readonly string[]) {
	// biome-ignore lint/plugin: length check
	return 0 === value.length
}

function test_length_non_empty_string_reverse(value: string) {
	// biome-ignore lint/plugin: length check
	return 1 <= value.length
}

function valid_length_string(value: string) {
	return String.isEmpty(value)
}

function valid_length_array(value: string[]) {
	return Array.isArrayNonEmpty(value)
}

function valid_last_item(items: string[]) {
	return Array.last(items)
}

function valid_non_literal_value(value: string) {
	const label = `${value}:result`
	return label
}

function valid_tailwind_classname() {
	return <div className="border border-border bg-background" />
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

// This should NOT be flagged by primitive const
// biome-ignore lint/plugin: simple function
const VALID_FUNCTION = () => 'hello'

function test_wrapper_fn(x: number) {
	return Math.abs(x)
}

function test_wrapper_ctor(name: string) {
	return new Error(name)
}

function valid_named_function(x: string) {
	if (x) return x

	return 'fallback'
}

function valid_inline_callback(items: string[]) {
	return pipe(
		items,
		Array.map(item => item)
	)
}

function test_in_operator(obj: object) {
	// biome-ignore lint/plugin: in operator
	return 'name' in obj
}

function test_in_operator_double_quotes(obj: object) {
	// biome-ignore lint/plugin: in operator
	return 'name' in obj
}

function test_nullish_checks(value: unknown) {
	// biome-ignore lint/plugin: nullish check
	if (value == null) return
	// biome-ignore lint/plugin: nullish check
	if (value != null) return
	// biome-ignore lint/plugin: nullish check
	if (value === null) return
	// biome-ignore lint/plugin: nullish check
	if (value !== null) return
	// biome-ignore lint/plugin: nullish check
	if (value === undefined) return
	// biome-ignore lint/plugin: nullish check
	if (value !== undefined) return
}

// biome-ignore lint/plugin: dynamic import
void import('effect')

function test_effect_fail() {
	// biome-ignore lint/plugin: effect antipattern
	return Effect.fail(new TestError({cause: undefined}))
}

function test_effect_succeed() {
	// biome-ignore lint/plugin: effect antipattern
	return Effect.succeed('ok')
}

function test_else(items: string[], result: string[]) {
	// biome-ignore lint/plugin: else clause
	if (Array.isArrayNonEmpty(items)) {
		result.push('has items')
	} else {
		result.push('empty')
	}
}

function valid_multiline_braced_return(content: ReactNode) {
	if (content) {
		return <div>{content}</div>
	}

	return <span>empty</span>
}

// biome-ignore lint/plugin: react compiler antipattern
const ForwardedComponent = forwardRef<HTMLDivElement>((props, ref) => <div ref={ref} />)

void valid_gen
void valid_fn_untraced
void valid_direct_access
void valid_alias_from_call
void valid_inline_check
void valid_non_trivial_check
void valid_length_string
void valid_length_array
void valid_last_item
void valid_non_literal_value
void valid_tailwind_classname
void valid_named_function
void valid_inline_callback
