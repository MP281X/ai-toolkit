import {Effect, pipe, Stream, String} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

// Distinct oklch colors at similar lightness/chroma to the theme primary, spread across hue wheel
const cursorPalette = [
	'oklch(0.72 0.18 50)',
	'oklch(0.72 0.18 140)',
	'oklch(0.72 0.18 210)',
	'oklch(0.72 0.18 270)',
	'oklch(0.72 0.18 320)',
	'oklch(0.72 0.18 80)',
	'oklch(0.72 0.18 175)',
	'oklch(0.72 0.18 10)'
]

function getIdentity() {
	const existingId = window.sessionStorage.getItem('portfolio.id')
	const existingName = window.sessionStorage.getItem('portfolio.name')
	const existingColor = window.sessionStorage.getItem('portfolio.color')

	if (existingId && existingName && existingColor) return {id: existingId, name: existingName, color: existingColor}

	const seed = pipe(crypto.randomUUID(), String.replaceAll('-', ''), String.slice(0, 6))

	let colorHash = 0
	for (const byte of new TextEncoder().encode(seed)) colorHash += byte

	const colorIndex = colorHash % cursorPalette.length
	const next = {
		id: `v-${seed}`,
		name: `Guest-${pipe(seed, String.slice(0, 3))}`,
		color: cursorPalette[colorIndex] ?? 'oklch(0.72 0.18 50)'
	}

	window.sessionStorage.setItem('portfolio.id', next.id)
	window.sessionStorage.setItem('portfolio.name', next.name)
	window.sessionStorage.setItem('portfolio.color', next.color)

	return next
}

export const identity = getIdentity()

export const portfolioAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('portfolio.join', {id: identity.id, name: identity.name, color: identity.color})),
			Stream.unwrap
		)
	)
)
