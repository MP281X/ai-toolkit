import {Array, String, pipe} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {terminalScreenStore} from './model.ts'

function snapshotText(screen: ReturnType<typeof terminalScreenStore>) {
	return Array.join('')(screen.snapshot())
}

describe('terminalScreenStore', () => {
	it('keeps static alt-screen regions after later partial repaint output', async () => {
		const screen = terminalScreenStore({cols: 24, rows: 5})
		try {
			await screen.write('\u001b[?1049h\u001b[HHEADER\u001b[5;1HINPUT> ')
			await screen.write('\u001b[3;1Hworking')

			const snapshot = snapshotText(screen)

			expect(snapshot).toContain('\u001b[?1049h')
			expect(snapshot).toContain('HEADER')
			expect(snapshot).toContain('working')
			expect(snapshot).toContain('INPUT> ')
		} finally {
			screen.dispose()
		}
	})

	it('caps normal scrollback at the backend snapshot limit', async () => {
		const screen = terminalScreenStore({cols: 16, rows: 5})
		try {
			await screen.write(
				pipe(
					Array.range(0, 1_019),
					Array.map(index => `line-${index}`),
					Array.join('\r\n')
				)
			)

			const snapshot = snapshotText(screen)

			expect(snapshot).not.toContain('line-0')
			expect(snapshot).toContain('line-1019')
			expect(String.split('\r\n')(snapshot).length).toBeLessThanOrEqual(1_005)
		} finally {
			screen.dispose()
		}
	})

	it('restores serialized cursor, modes, and alt buffer into a fresh screen', async () => {
		const source = terminalScreenStore({cols: 20, rows: 4})
		const restored = terminalScreenStore({cols: 20, rows: 4})
		try {
			await source.write('normal\u001b[?1h\u001b[?1049h\u001b[Halt\u001b[2;3Hcursor')
			await restored.write(snapshotText(source))

			const snapshot = snapshotText(restored)

			expect(snapshot).toContain('\u001b[?1h')
			expect(snapshot).toContain('\u001b[?1049h')
			expect(snapshot).toContain('alt')
			expect(snapshot).toContain('cursor')
			expect(snapshot).toBe(snapshotText(source))
		} finally {
			source.dispose()
			restored.dispose()
		}
	})
})
