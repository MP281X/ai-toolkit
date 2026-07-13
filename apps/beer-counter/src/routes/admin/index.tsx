import {useAtomSet} from '@effect/atom-react'

import {Array, Predicate} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'
import type {FormEvent} from 'react'
import {useState} from 'react'

import {BeerMark, ReconnectingNotice, ThemeButton, positions, useStableCounter} from '../-shared.tsx'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {Team} from '#rpcs/contracts.ts'
import {Minus, Plus, Trash2} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'
import {Input} from '@deslop/components/ui/input'

export const Route = createFileRoute('/admin/')({component: AdminRoute})

function messageFromError(error: unknown) {
	return Predicate.isObject(error) && 'message' in error && Predicate.isString(error['message'])
		? error['message']
		: 'Command failed'
}

function AdminRoute() {
	const counter = useStableCounter()
	const [username, setUsername] = useState('admin')
	const [password, setPassword] = useState('')
	const [newTeam, setNewTeam] = useState('')
	const credentials = {password, username}
	const addTeam = useAtomSet(RpcClient.mutation('counter.add'), {mode: 'promise'})
	const [addState, setAddState] = useState<{readonly pending: boolean; readonly error: string | null}>({
		error: null,
		pending: false
	})

	async function submitAdd(event: FormEvent) {
		event.preventDefault()
		setAddState({error: null, pending: true})
		try {
			await addTeam({payload: {...credentials, name: newTeam}})
			setNewTeam('')
			setAddState({error: null, pending: false})
		} catch (error) {
			setAddState({error: messageFromError(error), pending: false})
		}
	}

	return (
		<main className="bg-background text-foreground h-dvh w-dvw overflow-x-hidden overflow-y-auto p-3 sm:p-4">
			<header className="mb-4 flex items-center justify-between gap-3 border-b pb-4">
				<div className="flex min-w-0 items-center gap-3">
					<BeerMark className="size-7" />
					<div className="min-w-0">
						<h1 className="truncate text-2xl font-black uppercase">Beer admin</h1>
						<p className="text-muted-foreground text-xs uppercase">server-verified commands</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						className="border-border text-muted-foreground hover:text-foreground border px-3 py-2 text-xs uppercase"
						to="/"
					>
						scoreboard
					</Link>
					<ThemeButton />
				</div>
			</header>

			<section className="bg-card mb-4 grid gap-3 border p-3 sm:grid-cols-[1fr_1fr]">
				<label className="grid gap-1 text-xs uppercase">
					Username
					<Input
						value={username}
						autoComplete="username"
						onChange={event => {
							setUsername(event.target.value)
						}}
					/>
				</label>
				<label className="grid gap-1 text-xs uppercase">
					Password
					<Input
						value={password}
						type="password"
						autoComplete="current-password"
						placeholder="beer-counter"
						onChange={event => {
							setPassword(event.target.value)
						}}
					/>
				</label>
			</section>

			<form
				className="bg-card mb-4 grid gap-2 border p-3 sm:grid-cols-[1fr_auto]"
				onSubmit={event => void submitAdd(event)}
			>
				<Input
					value={newTeam}
					placeholder="New team name"
					onChange={event => {
						setNewTeam(event.target.value)
					}}
				/>
				<Button disabled={addState.pending} type="submit">
					Add team
				</Button>
				{Predicate.isNotNull(addState.error) && (
					<p className="text-destructive text-xs sm:col-span-2">{addState.error}</p>
				)}
			</form>

			<section className="grid gap-2">
				{Array.map(positions(counter.teams), item => (
					<TeamRow key={item.team.id} credentials={credentials} position={item.position} team={item.team} />
				))}
			</section>
			<ReconnectingNotice connected={counter.connected} />
		</main>
	)
}

function TeamRow(props: {
	readonly credentials: {readonly password: string; readonly username: string}
	readonly position: number
	readonly team: Team
}) {
	const adjust = useAtomSet(RpcClient.mutation('counter.adjust'), {mode: 'promise'})
	const rename = useAtomSet(RpcClient.mutation('counter.rename'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('counter.remove'), {mode: 'promise'})
	const [amount, setAmount] = useState('1')
	const [draftName, setDraftName] = useState<string | null>(null)
	const [pending, setPending] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function run(label: string, command: () => Promise<unknown>) {
		setPending(label)
		setError(null)
		try {
			await command()
			return true
		} catch (caught) {
			setError(messageFromError(caught))
			return false
		} finally {
			setPending(null)
		}
	}

	const isPending = Predicate.isNotNull(pending)
	const feedback = Predicate.isNotNull(pending) ? `${pending}…` : error

	async function submitRename(name: string) {
		if (name !== props.team.name) {
			await run('rename', () => rename({payload: {...props.credentials, id: props.team.id, name}}))
		}
		setDraftName(null)
	}

	return (
		<article className="bg-card grid gap-3 border p-3 lg:grid-cols-[4rem_1fr_7rem_14rem_5rem] lg:items-center">
			<div className="text-primary text-2xl font-black">#{props.position}</div>
			<label className="grid gap-1 text-xs uppercase">
				Name
				<Input
					value={Predicate.isNull(draftName) ? props.team.name : draftName}
					onChange={event => {
						setDraftName(event.target.value)
					}}
					onBlur={event => {
						void submitRename(event.currentTarget.value)
					}}
				/>
			</label>
			<div>
				<div className="text-muted-foreground text-xs uppercase">Count</div>
				<div className="text-3xl font-black tabular-nums">{props.team.count}</div>
			</div>
			<div className="grid grid-cols-[1fr_auto_auto] gap-2">
				<Input
					min={1}
					step={1}
					inputMode="numeric"
					value={amount}
					type="number"
					aria-label={`${props.team.name} update amount`}
					onChange={event => {
						setAmount(event.target.value)
					}}
				/>
				<Button
					variant="outline"
					disabled={isPending}
					aria-label={`Subtract from ${props.team.name}`}
					onClick={() =>
						void run('subtract', () =>
							adjust({
								payload: {...props.credentials, amount: Number(amount), direction: 'subtract', id: props.team.id}
							})
						)
					}
				>
					<Minus className="size-4" />
				</Button>
				<Button
					disabled={isPending}
					aria-label={`Add to ${props.team.name}`}
					onClick={() =>
						void run('add', () =>
							adjust({payload: {...props.credentials, amount: Number(amount), direction: 'add', id: props.team.id}})
						)
					}
				>
					<Plus className="size-4" />
				</Button>
			</div>
			<Button
				variant="destructive"
				disabled={isPending}
				onClick={() => {
					if (confirm(`Remove ${props.team.name}? Its count will be deleted.`)) {
						void run('remove', () => remove({payload: {...props.credentials, id: props.team.id}}))
					}
				}}
			>
				<Trash2 className="size-4" />
			</Button>
			{Predicate.isNotNull(feedback) && <p className="text-muted-foreground text-xs lg:col-span-5">{feedback}</p>}
		</article>
	)
}
