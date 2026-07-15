import {useAtomSuspense} from '@effect/atom-react'

import {Array, String, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {counterStateAtom} from '#lib/state.ts'
import type {Team} from '#rpcs/contracts.ts'
import {Beer} from '@deslop/components/icons'

export const Route = createFileRoute('/(home)/')({component: Home})

function rankedTeams(teams: readonly Team[]) {
	return [...teams].toSorted((left, right) => right.count - left.count || left.createdOrder - right.createdOrder)
}

function TeamRow(input: {
	readonly leader: number
	readonly rank: number
	readonly team: Team
	readonly leftWing: boolean
}) {
	const width = input.leader === 0 ? 0 : (input.team.count / input.leader) * 100

	return (
		<li className="relative grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_4rem] items-center gap-2 overflow-hidden px-3 sm:min-h-0 sm:grid-cols-[3.75rem_minmax(0,1fr)_6.25rem] sm:gap-3 sm:px-4">
			<div
				aria-hidden="true"
				className={
					input.leftWing
						? 'bg-muted absolute inset-y-0 left-0 sm:right-0 sm:left-auto'
						: 'bg-muted absolute inset-y-0 left-0'
				}
				style={{width: `${width}%`}}
			/>
			<b className="relative text-base tabular-nums sm:text-2xl">
				{pipe(input.rank, String.String, String.padStart(2, '0'))}
			</b>
			<span className="relative truncate font-medium sm:text-xl">{input.team.name}</span>
			<strong className="relative flex items-center justify-end gap-1.5 text-xl tabular-nums sm:text-4xl">
				{input.team.count} <Beer aria-hidden="true" className="text-primary size-3 sm:size-5" />
			</strong>
		</li>
	)
}

function Crest(input: {readonly mobile?: boolean}) {
	return (
		<div
			className={
				input.mobile === true
					? 'bg-card flex shrink-0 items-center justify-center gap-3 border-b p-2 sm:hidden'
					: 'bg-card hidden min-w-0 flex-col items-center justify-center gap-4 border-x p-4 text-center sm:flex'
			}
		>
			<img
				src="/farabus-logo.png"
				alt="Chiosco Dai Farabus Martignacco"
				className={input.mobile === true ? 'h-14 w-14 object-contain' : 'w-[78%] max-w-36 object-contain'}
			/>
			<p className="text-[10px] leading-relaxed font-medium tracking-wider uppercase">
				Chiosco Dai Farabus · Martignacco.
			</p>
		</div>
	)
}

function Home() {
	const state = useAtomSuspense(counterStateAtom)
	const teams = rankedTeams(state.value.teams)
	const split = Math.min(6, teams.length)
	const left = Array.take(teams, split)
	const right = Array.drop(teams, split)
	const leader = teams[0]?.count ?? 0
	const leftRows = {gridTemplateRows: `repeat(${Math.max(1, left.length)}, minmax(0, 1fr))`}
	const rightRows = {gridTemplateRows: `repeat(${Math.max(1, right.length)}, minmax(0, 1fr))`}

	return (
		<main className="bg-background text-foreground flex h-dvh w-dvw flex-col overflow-hidden">
			<Crest mobile />
			<section className="min-h-0 flex-1 overflow-y-auto sm:grid sm:grid-cols-[1fr_19%_1fr] sm:overflow-hidden">
				<ol className="divide-border grid divide-y sm:h-full" style={leftRows}>
					{Array.map(left, (team, index) => (
						<TeamRow key={team.id} leader={leader} rank={index + 1} team={team} leftWing />
					))}
				</ol>
				<Crest />
				<ol className="divide-border grid divide-y sm:h-full" style={rightRows}>
					{Array.map(right, (team, index) => (
						<TeamRow key={team.id} leader={leader} rank={split + index + 1} team={team} leftWing={false} />
					))}
				</ol>
			</section>
		</main>
	)
}
