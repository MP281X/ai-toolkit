import {useAtomSet} from '@effect/atom-react'

import {Array, Predicate} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'
import type {FormEvent} from 'react'
import {useState} from 'react'

import {ReconnectingNotice, ThemeButton, positions, useStableCounter} from '../-shared.tsx'

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
		<main className="admin-shell">
			<div className="admin-frame">
				<header className="admin-header">
					<div>
						<p className="eyebrow">Control desk</p>
						<h1>Team roster</h1>
					</div>
					<div className="scoreboard-actions">
						<Link className="admin-link" to="/">
							Standings
						</Link>
						<ThemeButton />
					</div>
				</header>

				<form className="admin-toolbar" onSubmit={event => void submitAdd(event)}>
					<label className="admin-field">
						Username
						<Input
							value={username}
							autoComplete="username"
							onChange={event => {
								setUsername(event.target.value)
							}}
						/>
					</label>
					<label className="admin-field">
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
					<label className="admin-field">
						New team
						<Input
							value={newTeam}
							placeholder="Team name"
							onChange={event => {
								setNewTeam(event.target.value)
							}}
						/>
					</label>
					<Button disabled={addState.pending} type="submit">
						Add team
					</Button>
					{Predicate.isNotNull(addState.error) && <p className="admin-feedback">{addState.error}</p>}
				</form>

				<div className="roster-heading">
					<h2>Current standings</h2>
					<span>{counter.teams.length} teams</span>
				</div>
				<section aria-label="Team controls">
					{Array.map(positions(counter.teams), item => (
						<TeamRow key={item.team.id} credentials={credentials} position={item.position} team={item.team} />
					))}
				</section>
			</div>
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
		<article className="admin-row">
			<div className="admin-rank">{props.position < 10 ? `0${props.position}` : props.position}</div>
			<label className="admin-cell">
				<span className="sr-only">Team name</span>
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
			<div className="admin-cell admin-count" aria-label={`${props.team.count} beers`}>
				{props.team.count}
			</div>
			<div className="admin-cell admin-cell--delta">
				<div className="admin-delta">
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
			</div>
			<Button
				className="admin-cell--remove"
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
			{Predicate.isNotNull(feedback) && <p className="admin-feedback">{feedback}</p>}
		</article>
	)
}
