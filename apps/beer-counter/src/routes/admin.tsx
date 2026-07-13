import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Match, Predicate} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {ThemeButton, scoreboardAtom} from '#routes/-shared.tsx'
import type {Team} from '#rpcs/contracts.ts'
import {Minus, Plus, Trash2} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'
import {Input} from '@deslop/components/ui/input'

export const Route = createFileRoute('/admin')({component: AdminPage})

type Credentials = {readonly password: string; readonly username: string}

function messageOf(error: unknown) {
	return error instanceof Error ? error.message : 'Command failed.'
}

function AdminPage() {
	const [credentials, setCredentials] = useState<Credentials>()
	return (
		<main className="admin-shell">
			<header className="admin-header">
				<div>
					<p className="eyebrow">Festival controls</p>
					<h1>Beer counter / admin</h1>
				</div>
				<div className="header-actions">
					<Link to="/" className="admin-link">
						Scoreboard
					</Link>
					<ThemeButton />
				</div>
			</header>
			{credentials ? <Roster credentials={credentials} /> : <Login onAuthenticated={setCredentials} />}
		</main>
	)
}

function Login(props: {readonly onAuthenticated: (credentials: Credentials) => void}) {
	const authenticate = useAtomSet(RpcClient.mutation('admin.authenticate'), {mode: 'promise'})
	const [username, setUsername] = useState('admin')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	async function submit() {
		setPending(true)
		setError('')
		const credentials = {password, username}
		try {
			await authenticate({payload: credentials})
			props.onAuthenticated(credentials)
		} catch (cause) {
			setError(messageOf(cause))
		} finally {
			setPending(false)
		}
	}
	return (
		<form
			className="login-panel"
			onSubmit={event => {
				event.preventDefault()
				void submit()
			}}
		>
			<h2>Admin sign in</h2>
			<label>
				Username
				<Input
					autoComplete="username"
					value={username}
					onChange={event => {
						setUsername(event.target.value)
					}}
				/>
			</label>
			<label>
				Password
				<Input
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={event => {
						setPassword(event.target.value)
					}}
				/>
			</label>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<Button type="submit" disabled={pending}>
				{pending ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	)
}

function Roster(props: {readonly credentials: Credentials}) {
	const state = useAtomSuspense(scoreboardAtom)
	const addTeam = useAtomSet(RpcClient.mutation('teams.add'), {mode: 'promise'})
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	async function submit() {
		setPending(true)
		setError('')
		try {
			await addTeam({payload: {...props.credentials, name}})
			setName('')
		} catch (cause) {
			setError(messageOf(cause))
		} finally {
			setPending(false)
		}
	}
	return (
		<section className="roster">
			<form
				className="add-team"
				onSubmit={event => {
					event.preventDefault()
					void submit()
				}}
			>
				<div>
					<h2>Teams</h2>
					<p>{state.value.teams.length} on the board</p>
				</div>
				<Input
					aria-label="New team name"
					placeholder="New team name"
					value={name}
					onChange={event => {
						setName(event.target.value)
					}}
				/>
				<Button type="submit" disabled={pending}>
					{pending ? 'Adding…' : 'Add team'}
				</Button>
				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}
			</form>
			<div className="roster-list">
				{Array.map(state.value.teams, team => (
					<TeamRow key={team.id} team={team} credentials={props.credentials} />
				))}
			</div>
		</section>
	)
}

function TeamRow(props: {readonly credentials: Credentials; readonly team: Team}) {
	const adjust = useAtomSet(RpcClient.mutation('teams.adjust'), {mode: 'promise'})
	const rename = useAtomSet(RpcClient.mutation('teams.rename'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('teams.remove'), {mode: 'promise'})
	const [amount, setAmount] = useState('1')
	const [name, setName] = useState(props.team.name)
	const [error, setError] = useState('')
	const [pending, setPending] = useState<'adjust' | 'rename' | 'remove'>()
	async function command(kind: 'adjust' | 'rename' | 'remove', run: () => Promise<unknown>) {
		setPending(kind)
		setError('')
		try {
			await run()
		} catch (cause) {
			setName(props.team.name)
			setError(messageOf(cause))
		} finally {
			setPending(undefined)
		}
	}
	const parsedAmount = Number(amount)
	return (
		<article className="team-row">
			<div className="team-identity">
				<span className="current-count">{props.team.count}</span>
				<Input
					aria-label={`Name for ${props.team.name}`}
					value={name}
					onChange={event => {
						setName(event.target.value)
					}}
					onBlur={() => {
						if (name !== props.team.name) {
							void command('rename', () => rename({payload: {...props.credentials, id: props.team.id, name}}))
						}
					}}
				/>
			</div>
			<div className="counter-controls">
				<Button
					aria-label={`Subtract from ${props.team.name}`}
					variant="outline"
					size="icon"
					disabled={Predicate.isNotUndefined(pending) || !(Number.isSafeInteger(parsedAmount) && parsedAmount > 0)}
					onClick={() =>
						void command('adjust', () =>
							adjust({payload: {...props.credentials, amount: parsedAmount, direction: 'subtract', id: props.team.id}})
						)
					}
				>
					<Minus />
				</Button>
				<Input
					className="amount-input"
					aria-label={`Amount for ${props.team.name}`}
					inputMode="numeric"
					min="1"
					step="1"
					type="number"
					value={amount}
					onChange={event => {
						setAmount(event.target.value)
					}}
				/>
				<Button
					aria-label={`Add to ${props.team.name}`}
					size="icon"
					disabled={Predicate.isNotUndefined(pending) || !(Number.isSafeInteger(parsedAmount) && parsedAmount > 0)}
					onClick={() =>
						void command('adjust', () =>
							adjust({payload: {...props.credentials, amount: parsedAmount, direction: 'add', id: props.team.id}})
						)
					}
				>
					<Plus />
				</Button>
				<Button
					aria-label={`Remove ${props.team.name}`}
					variant="destructive"
					size="icon"
					disabled={Predicate.isNotUndefined(pending)}
					onClick={() => {
						if (window.confirm(`Remove ${props.team.name}? Its count of ${props.team.count} will be deleted.`)) {
							void command('remove', () => remove({payload: {...props.credentials, id: props.team.id}}))
						}
					}}
				>
					<Trash2 />
				</Button>
			</div>
			{pending && (
				<p className="row-status" role="status">
					{Match.value(pending).pipe(
						Match.when('adjust', () => 'Saving count…'),
						Match.when('rename', () => 'Saving name…'),
						Match.orElse(() => 'Removing…')
					)}
				</p>
			)}
			{error && (
				<p className="form-error row-error" role="alert">
					{error}
				</p>
			)}
		</article>
	)
}
