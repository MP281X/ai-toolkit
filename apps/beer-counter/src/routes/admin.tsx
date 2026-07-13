/* oxlint-disable @deslop/oxlint-rules/no-access-alias, @deslop/oxlint-rules/no-condition-alias, @deslop/oxlint-rules/no-object-destructure, @deslop/oxlint-rules/no-promise-callback */
import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Predicate} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {teamsAtom} from '#lib/teams.ts'
import type {Team} from '#rpcs/contracts.ts'
import {Beer, Minus, Plus, Trash2} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'

export const Route = createFileRoute('/admin')({component: Admin})

type Credentials = {readonly password: string; readonly username: string}

function message(error: unknown) {
	if (Predicate.isObject(error) && 'message' in error && Predicate.isString(error['message'])) {
		return error['message']
	}
	return 'Command failed.'
}

function Admin() {
	const teams = useAtomSuspense(teamsAtom).value
	const [credentials, setCredentials] = useState<Credentials>({password: '', username: 'admin'})
	const [newName, setNewName] = useState('')
	const add = useAtomSet(RpcClient.mutation('teams.add'), {mode: 'promise'})
	const [addError, setAddError] = useState('')

	return (
		<main className="admin-shell">
			<header className="admin-header">
				<h1>
					<Beer /> Beer counter
				</h1>
			</header>
			<section className="admin-auth" aria-label="Admin credentials">
				<input
					className="admin-input"
					aria-label="Username"
					value={credentials.username}
					onChange={event => {
						setCredentials({...credentials, username: event.target.value})
					}}
				/>
				<input
					className="admin-input"
					aria-label="Password"
					type="password"
					placeholder="Password"
					value={credentials.password}
					onChange={event => {
						setCredentials({...credentials, password: event.target.value})
					}}
				/>
			</section>
			<form
				className="admin-add"
				onSubmit={event => {
					event.preventDefault()
					setAddError('')
					void add({payload: {...credentials, name: newName}})
						.then(() => {
							setNewName('')
						})
						.catch(error => {
							setAddError(message(error))
						})
				}}
			>
				<input
					className="admin-input"
					aria-label="New team name"
					placeholder="Team name"
					value={newName}
					onChange={event => {
						setNewName(event.target.value)
					}}
				/>
				<Button type="submit">Add team</Button>
				{addError && <p className="command-error">{addError}</p>}
			</form>
			<section className="admin-list">
				{teams.map(team => (
					<TeamRow credentials={credentials} key={team.id} team={team} />
				))}
			</section>
		</main>
	)
}

function TeamRow({credentials, team}: {readonly credentials: Credentials; readonly team: Team}) {
	const adjust = useAtomSet(RpcClient.mutation('teams.adjust'), {mode: 'promise'})
	const rename = useAtomSet(RpcClient.mutation('teams.rename'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('teams.remove'), {mode: 'promise'})
	const [amount, setAmount] = useState('1')
	const [name, setName] = useState(team.name)
	const [pending, setPending] = useState(false)
	const [confirmingRemove, setConfirmingRemove] = useState(false)
	const [error, setError] = useState('')

	function run(command: () => Promise<unknown>) {
		setPending(true)
		setError('')
		void command()
			.catch(cause => {
				setName(team.name)
				setError(message(cause))
			})
			.finally(() => {
				setPending(false)
			})
	}
	const parsedAmount = Number(amount)
	const validAmount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0

	return (
		<article className="admin-row">
			<div className="admin-team">
				<input
					className="admin-input"
					aria-label={`Name for ${team.name}`}
					disabled={pending}
					value={name}
					onChange={event => {
						setName(event.target.value)
					}}
					onBlur={() => {
						if (name !== team.name) run(() => rename({payload: {...credentials, id: team.id, name}}))
					}}
				/>
				<strong>
					<Beer /> {team.count}
				</strong>
			</div>
			<div className="admin-actions">
				<input
					className="admin-input"
					aria-label={`Amount for ${team.name}`}
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
					aria-label={`Subtract from ${team.name}`}
					disabled={pending || !validAmount}
					size="icon"
					variant="outline"
					onClick={() => {
						run(() => adjust({payload: {...credentials, amount: -parsedAmount, id: team.id}}))
					}}
				>
					<Minus />
				</Button>
				<Button
					aria-label={`Add to ${team.name}`}
					disabled={pending || !validAmount}
					size="icon"
					onClick={() => {
						run(() => adjust({payload: {...credentials, amount: parsedAmount, id: team.id}}))
					}}
				>
					<Plus />
				</Button>
				{confirmingRemove ? (
					<>
						<span className="remove-confirmation">Delete count?</span>
						<Button
							variant="outline"
							onClick={() => {
								setConfirmingRemove(false)
							}}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setConfirmingRemove(false)
								run(() => remove({payload: {...credentials, id: team.id}}))
							}}
						>
							Remove
						</Button>
					</>
				) : (
					<Button
						aria-label={`Remove ${team.name}`}
						disabled={pending}
						size="icon"
						variant="destructive"
						onClick={() => {
							setConfirmingRemove(true)
						}}
					>
						<Trash2 />
					</Button>
				)}
			</div>
			{pending && <p className="command-pending">Saving…</p>}
			{error && <p className="command-error">{error}</p>}
		</article>
	)
}
