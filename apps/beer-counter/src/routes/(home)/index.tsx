import {useAtomSuspense} from '@effect/atom-react'

import {Array} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {counterStateAtom} from '#lib/state.ts'
import type {Team} from '#rpcs/contracts.ts'
import {Beer} from '@deslop/components/icons'

export const Route = createFileRoute('/(home)/')({component: Home})

function rankedTeams(teams: readonly Team[]) {
	return [...teams].toSorted((left, right) => right.count - left.count || left.createdOrder - right.createdOrder)
}

function TeamRow(input: {readonly leader: number; readonly team: Team; readonly leftWing: boolean}) {
	const width = input.leader === 0 ? 0 : (input.team.count / input.leader) * 100

	return (
		<li className="relative grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden px-3 sm:min-h-0 sm:gap-4 sm:px-[clamp(1rem,2vw,2rem)]">
			<div
				aria-hidden="true"
				className={
					input.leftWing
						? 'bg-muted absolute inset-y-0 left-0 sm:right-0 sm:left-auto'
						: 'bg-muted absolute inset-y-0 left-0'
				}
				style={{width: `${width}%`}}
			/>
			<span className="relative truncate text-lg font-medium sm:text-[clamp(1.75rem,2.5vw,3.25rem)]">
				{input.team.name}
			</span>
			<strong className="relative flex min-w-0 items-center justify-end gap-1.5 text-xl whitespace-nowrap tabular-nums sm:text-[clamp(1.75rem,2.5vw,3.25rem)]">
				{input.team.count}{' '}
				<Beer aria-hidden="true" className="text-primary size-4 shrink-0 sm:size-[clamp(1.5rem,2vw,2.75rem)]" />
			</strong>
		</li>
	)
}

function Crest(input: {readonly mobile?: boolean}) {
	return (
		<div
			className={
				input.mobile === true
					? 'bg-card flex shrink-0 items-center justify-center border-b p-2 sm:hidden'
					: 'bg-card hidden min-w-0 items-center justify-center border-x p-4 sm:flex'
			}
		>
			<img
				src="/farabus-logo.png"
				alt="Chiosco Dai Farabus Martignacco"
				className={
					input.mobile === true
						? 'h-12 w-12 object-contain dark:invert'
						: 'w-[clamp(4.5rem,7vw,9rem)] max-w-[65%] object-contain dark:invert'
				}
			/>
		</div>
	)
}

function Home() {
	const state = useAtomSuspense(counterStateAtom)
	const teams = rankedTeams(state.value.teams)
	const split = Math.ceil(teams.length / 2)
	const left = Array.take(teams, split)
	const right = Array.drop(teams, split)
	const leader = teams[0]?.count ?? 0
	const mobileRows = {gridTemplateRows: `repeat(${Math.max(1, teams.length)}, minmax(4rem, 1fr))`}
	const leftRows = {gridTemplateRows: `repeat(${Math.max(1, left.length)}, minmax(0, 1fr))`}
	const rightRows = {gridTemplateRows: `repeat(${Math.max(1, right.length)}, minmax(0, 1fr))`}

	return (
		<main className="bg-background text-foreground flex h-dvh w-dvw flex-col overflow-hidden">
			<Crest mobile />
			<section className="min-h-0 flex-1 overflow-y-auto sm:hidden">
				<ol className="divide-border grid min-h-full divide-y" style={mobileRows}>
					{Array.map(teams, team => (
						<TeamRow key={team.id} leader={leader} team={team} leftWing={false} />
					))}
				</ol>
			</section>
			<section className="hidden min-h-0 flex-1 grid-cols-[1fr_clamp(9rem,12vw,14rem)_1fr] overflow-hidden sm:grid">
				<ol className="divide-border grid divide-y sm:h-full" style={leftRows}>
					{Array.map(left, team => (
						<TeamRow key={team.id} leader={leader} team={team} leftWing />
					))}
				</ol>
				<Crest />
				<ol className="divide-border grid divide-y sm:h-full" style={rightRows}>
					{Array.map(right, team => (
						<TeamRow key={team.id} leader={leader} team={team} leftWing={false} />
					))}
				</ol>
			</section>
		</main>
	)
}
