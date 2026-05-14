import {Array, pipe} from 'effect'

import {baseArchitectureRules} from './base-architecture.ts'
import {baseIndirectionRules} from './base-indirection.ts'
import {baseTypeSafetyRules} from './base-type-safety.ts'
import {effectRules} from './effect.ts'
import type {Rule, RuleScope} from './helpers.ts'
import {scopedRuleId} from './helpers.ts'
import {reactRules} from './react.ts'

export const allRuleScopes = ['base', 'react', 'effect'] as const satisfies readonly RuleScope[]

export type ScopedRule = Rule & {
	readonly scope: RuleScope
}

export function rulesForScopes(scopes: readonly RuleScope[], plannedOnly: boolean) {
	return pipe(
		[
			{rules: baseTypeSafetyRules, scope: 'base'},
			{rules: baseIndirectionRules, scope: 'base'},
			{rules: reactRules, scope: 'base'},
			{rules: baseArchitectureRules, scope: 'base'},
			{rules: reactRules, scope: 'react'},
			{rules: effectRules, scope: 'effect'}
		] as const satisfies readonly {readonly rules: readonly Rule[]; readonly scope: RuleScope}[],
		Array.flatMap(group =>
			Array.map(group.rules, rule => ({
				id: rule.id,
				run: rule.run,
				scope: group.scope
			}))
		),
		Array.filter(
			rule =>
				new Set(scopes).has(rule.scope) &&
				(!plannedOnly ||
					new Set([
						'base/no-type-assertion-except-as-const',
						'base/prefer-undefined-over-null',
						'base/prefer-optional-property',
						'base/no-redundant-type-syntax',
						'base/no-redundant-type-system-check',
						'base/no-explicit-default-value',
						'base/no-unnecessary-named-type',
						'base/no-single-use-local-binding',
						'base/no-pipe-method',
						'base/no-simple-local-binding',
						'base/prefer-flow-for-pipe-callback',
						'base/no-vacuous-abstraction',
						'base/prefer-arrow-callback',
						'base/no-local-namespace-import',
						'base/no-default-export-except-config',
						'base/no-deprecated-api',
						'base/no-plain-class',
						'react/no-jsx-props-object',
						'react/no-tailwind-class-indirection',
						'react/no-manual-memoization',
						'react/no-forward-ref',
						'react/no-use-state-lazy-initializer',
						'react/prefer-hook-variable',
						'react/no-jsx-variable',
						'react/no-property-mutation-outside-ref-current',
						'effect/no-standard-prototype-methods',
						'effect/no-single-operation-pipe',
						'effect/prefer-effect-catch-tag',
						'effect/prefer-pipe-for-multi-operation-composition',
						'effect/prefer-effect-fn-untraced',
						'effect/prefer-effect-gen-program',
						'effect/no-floating-effect',
						'effect/no-effect-without-semantics',
						'effect/no-untyped-effect-error',
						'effect/prefer-effect-random',
						'effect/prefer-effect-try',
						'effect/prefer-yield-property-access',
						'effect/prefer-schema-tagged-error',
						'effect/no-option-constructor',
						'effect/prefer-top-level-rcmap'
					]).has(scopedRuleId(rule.scope, rule.id)))
		)
	)
}
