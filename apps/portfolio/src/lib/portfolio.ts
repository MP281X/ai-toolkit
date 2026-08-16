import {Array} from 'effect'

import type {PortfolioState, PortfolioTrail, PortfolioVisitor} from '#rpcs/contracts.ts'

export const portfolioPalette = [
	'oklch(0.74 0.19 118)',
	'oklch(0.76 0.2 128)',
	'oklch(0.75 0.18 138)',
	'oklch(0.73 0.17 150)',
	'oklch(0.74 0.18 162)',
	'oklch(0.76 0.17 174)',
	'oklch(0.75 0.18 186)',
	'oklch(0.73 0.19 198)',
	'oklch(0.72 0.2 210)',
	'oklch(0.74 0.18 222)',
	'oklch(0.71 0.18 234)',
	'oklch(0.73 0.19 246)',
	'oklch(0.75 0.19 258)',
	'oklch(0.74 0.2 270)',
	'oklch(0.73 0.21 282)',
	'oklch(0.74 0.2 296)',
	'oklch(0.75 0.19 310)',
	'oklch(0.74 0.18 324)',
	'oklch(0.73 0.19 338)',
	'oklch(0.72 0.2 352)'
] as const

export function appendPortfolioTrail(trails: PortfolioState['trails'], trail: PortfolioTrail) {
	const next = Array.append(trails, trail)
	return Array.length(next) > 180 ? Array.drop(next, Array.length(next) - 180) : next
}

export function removePortfolioVisitor(visitors: PortfolioState['visitors'], id: string) {
	const next = Array.filter(visitors, visitor => visitor.id !== id)
	return Array.length(next) === Array.length(visitors) ? visitors : next
}

export function upsertPortfolioVisitor(visitors: PortfolioState['visitors'], visitor: PortfolioVisitor) {
	return Array.some(visitors, current => current.id === visitor.id)
		? Array.map(visitors, current => (current.id === visitor.id ? visitor : current))
		: Array.append(visitors, visitor)
}
