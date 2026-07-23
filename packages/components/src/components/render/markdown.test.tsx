import {describe, expect, it} from '@effect/vitest'

import {Array, String, pipe} from 'effect'

import {renderToStaticMarkup} from 'react-dom/server'
import {vi} from 'vite-plus/test'

import {Markdown} from './markdown.tsx'

vi.mock('dompurify', () => ({default: {sanitize: String.concat('')}}))

describe('Markdown', () => {
	it('renders repeated blocks independently', () => {
		const markdown = pipe(Array.replicate('repeat', 1_000), Array.join('\n\n'))
		const markup = renderToStaticMarkup(<Markdown>{markdown}</Markdown>)

		expect(markup.match(/<p>repeat<\/p>/gu)).toHaveLength(1_000)
	})
})
