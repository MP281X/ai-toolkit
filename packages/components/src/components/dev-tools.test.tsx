import {describe, expect, it} from '@effect/vitest'

import {renderToStaticMarkup} from 'react-dom/server'

import {DevTools} from './dev-tools.tsx'

describe('DevTools.Variants', () => {
	it('renders no selector for an empty child list', () => {
		const markup = renderToStaticMarkup(<DevTools.Variants>{[]}</DevTools.Variants>)

		expect(markup).not.toContain('<button')
		expect(markup).not.toContain('<nav')
	})

	it('renders one selector for each child', () => {
		const markup = renderToStaticMarkup(
			<DevTools.Variants>
				<span>first</span>
				<span>second</span>
			</DevTools.Variants>
		)

		expect(markup.match(/<button/gu)).toHaveLength(2)
		expect(markup).toContain('>1</button>')
		expect(markup).toContain('>2</button>')
		expect(markup).not.toContain('>3</button>')
	})
})
