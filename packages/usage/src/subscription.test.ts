import {describe, expect, it} from 'vite-plus/test'

import {claudeSubscriptionFromCacheJson, claudeSubscriptionFromUnknown, codexSubscriptionLabel} from './subscription.ts'

describe('subscription labels', () => {
	it('formats Codex plan strings as display labels', () => {
		expect(codexSubscriptionLabel('pro')).toEqual({label: 'Pro'})
		expect(codexSubscriptionLabel('team_plus')).toEqual({label: 'Team Plus'})
	})

	it('prefers Claude rate-limit tier over organization type', () => {
		expect(
			claudeSubscriptionFromUnknown({
				account: {billingType: 'free', organizationRateLimitTier: 'default_claude_max_20x', organizationType: 'team'}
			})
		).toEqual({label: 'Max 20x'})
	})

	it('falls back across Claude cache fields', () => {
		expect(claudeSubscriptionFromUnknown({account: {organizationType: 'team'}})).toEqual({label: 'Team'})
		expect(claudeSubscriptionFromUnknown({account: {billingType: 'pro'}})).toEqual({label: 'Pro'})
	})

	it('ignores missing or unparseable Claude cache content', () => {
		expect(claudeSubscriptionFromUnknown({account: {}})).toBeUndefined()
		expect(claudeSubscriptionFromCacheJson('not json')).toBeUndefined()
	})
})
