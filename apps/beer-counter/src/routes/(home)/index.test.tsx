import {assert, describe, it} from '@effect/vitest'

import {rankedTeams} from './index.tsx'

describe('rankedTeams', () => {
	it('orders by count and preserves creation order for ties', () => {
		const teams = rankedTeams([
			{count: 2, order: 2},
			{count: 5, order: 1},
			{count: 5, order: 0}
		])
		assert.deepStrictEqual(teams, [
			{count: 5, order: 0},
			{count: 5, order: 1},
			{count: 2, order: 2}
		])
	})
})
