import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Predicate, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {beerStateAtom} from '#lib/state.ts'
import type {Credentials, Team} from '#rpcs/contracts.ts'
import {Beer, Minus, Pencil, Plus, Save, Trash2} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@deslop/components/ui/dialog'
import {Input} from '@deslop/components/ui/input'
import {Spinner} from '@deslop/components/ui/spinner'
import {formatError} from '@deslop/components/utils'

export const Route = createFileRoute('/admin')({component: AdminRoute})

function Login(input: {readonly onAuthenticated: (credentials: Credentials) => void}) {
	const authenticate = useAtomSet(RpcClient.mutation('admin.authenticate'), {mode: 'promise'})
	const [username, setUsername] = useState('admin')
	const [password, setPassword] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		if (pending) return

		const credentials = {password, username}
		setPending(true)
		setError('')
		try {
			await authenticate({payload: credentials})
			input.onAuthenticated(credentials)
		} catch (cause) {
			setError(formatError(cause))
		} finally {
			setPending(false)
		}
	}

	return (
		<main className="grid min-h-0 flex-1 place-items-center p-4">
			<form onSubmit={event => void submit(event)} className="w-full max-w-sm border p-4">
				<div className="mb-4 flex items-center gap-2 border-b pb-3">
					<Beer className="text-primary size-5" />
					<h1 className="text-lg font-semibold">Beer counter admin</h1>
				</div>
				<label className="mb-3 block text-xs">
					<span className="text-muted-foreground mb-1 block">Username</span>
					<Input
						value={username}
						onChange={event => {
							setUsername(event.target.value)
						}}
						autoComplete="username"
					/>
				</label>
				<label className="mb-3 block text-xs">
					<span className="text-muted-foreground mb-1 block">Password</span>
					<Input
						type="password"
						value={password}
						onChange={event => {
							setPassword(event.target.value)
						}}
						autoComplete="current-password"
					/>
				</label>
				{error && (
					<p className="text-destructive mb-3 text-xs" role="alert">
						{error}
					</p>
				)}
				<Button type="submit" className="w-full" disabled={pending}>
					{pending && <Spinner />}
					Sign in
				</Button>
			</form>
		</main>
	)
}

function TeamRow(input: {readonly credentials: Credentials; readonly team: Team}) {
	const adjust = useAtomSet(RpcClient.mutation('admin.adjust'), {mode: 'promise'})
	const rename = useAtomSet(RpcClient.mutation('admin.rename'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('admin.remove'), {mode: 'promise'})
	const [amount, setAmount] = useState('1')
	const [nameDraft, setNameDraft] = useState<string>()
	const [pending, setPending] = useState<'add' | 'subtract' | 'rename' | 'remove' | null>(null)
	const [error, setError] = useState('')
	const [confirmingRemove, setConfirmingRemove] = useState(false)
	const name = nameDraft ?? input.team.name

	async function run(action: Exclude<typeof pending, null>, command: () => Promise<unknown>) {
		if (Predicate.isNotNull(pending)) return false
		setPending(action)
		setError('')
		try {
			await command()
			if (action === 'remove') setConfirmingRemove(false)
			return true
		} catch (cause) {
			setError(formatError(cause))
			return false
		} finally {
			setPending(null)
		}
	}

	async function renameTeam() {
		const succeeded = await run('rename', () => rename({payload: {...input.credentials, id: input.team.id, name}}))
		if (succeeded) setNameDraft(undefined)
	}

	function renameIcon() {
		if (pending === 'rename') return <Spinner />
		if (name === input.team.name) return <Pencil />
		return <Save />
	}

	function changeCount(direction: 'add' | 'subtract') {
		void run(direction, () =>
			adjust({payload: {...input.credentials, amount: Number(amount), direction, id: input.team.id}})
		)
	}

	return (
		<li className="border-border grid gap-2 border p-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto] sm:items-center">
			<div className="flex min-w-0 items-center gap-1">
				<Input
					aria-label={`Name for ${input.team.name}`}
					value={name}
					onChange={event => {
						setNameDraft(event.target.value)
					}}
					disabled={pending === 'rename'}
					className="min-w-0"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					disabled={Predicate.isNotNull(pending) || name === input.team.name}
					onClick={() => void renameTeam()}
					aria-label={`Rename ${input.team.name}`}
					title="Save team name"
				>
					{renameIcon()}
				</Button>
			</div>

			<div className="flex items-center gap-1">
				<span className="w-14 text-center text-xl font-bold tabular-nums" aria-label={`${input.team.count} beers`}>
					{input.team.count}
				</span>
				<Input
					type="number"
					inputMode="numeric"
					min="1"
					step="1"
					value={amount}
					onChange={event => {
						setAmount(event.target.value)
					}}
					aria-label={`Amount for ${input.team.name}`}
					className="w-20 text-center tabular-nums"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					disabled={Predicate.isNotNull(pending)}
					onClick={() => {
						changeCount('subtract')
					}}
					aria-label={`Subtract from ${input.team.name}`}
				>
					{pending === 'subtract' ? <Spinner /> : <Minus />}
				</Button>
				<Button
					type="button"
					size="icon"
					disabled={Predicate.isNotNull(pending)}
					onClick={() => {
						changeCount('add')
					}}
					aria-label={`Add to ${input.team.name}`}
				>
					{pending === 'add' ? <Spinner /> : <Plus />}
				</Button>
			</div>

			<Button
				type="button"
				variant="destructive"
				size="sm"
				disabled={Predicate.isNotNull(pending)}
				onClick={() => {
					setConfirmingRemove(true)
				}}
				className="sm:justify-self-end"
			>
				<Trash2 /> Remove
			</Button>
			{error && (
				<p className="text-destructive text-xs sm:col-span-3" role="alert">
					{error}
				</p>
			)}

			<Dialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove {input.team.name}?</DialogTitle>
						<DialogDescription>
							This permanently deletes the team and its count of {input.team.count}.
						</DialogDescription>
					</DialogHeader>
					{error && (
						<p className="text-destructive text-xs" role="alert">
							{error}
						</p>
					)}
					<DialogFooter>
						<DialogClose render={<Button variant="outline" disabled={pending === 'remove'} />}>Cancel</DialogClose>
						<Button
							type="button"
							variant="destructive"
							disabled={pending === 'remove'}
							onClick={() => void run('remove', () => remove({payload: {...input.credentials, id: input.team.id}}))}
						>
							{pending === 'remove' && <Spinner />}
							Delete team and count
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	)
}

function AdminPanel(input: {readonly credentials: Credentials; readonly signOut: () => void}) {
	const state = useAtomSuspense(beerStateAtom)
	const add = useAtomSet(RpcClient.mutation('admin.add'), {mode: 'promise'})
	const [name, setName] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')

	async function addTeam(event: React.FormEvent) {
		event.preventDefault()
		if (pending) return
		setPending(true)
		setError('')
		try {
			await add({payload: {...input.credentials, name}})
			setName('')
		} catch (cause) {
			setError(formatError(cause))
		} finally {
			setPending(false)
		}
	}

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
			<header className="mb-3 flex shrink-0 items-center justify-between border-b pb-3">
				<div>
					<p className="text-primary text-[10px] font-semibold tracking-[0.2em] uppercase">Authenticated admin</p>
					<h1 className="text-lg font-semibold">Beer counter</h1>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={input.signOut}>
					Sign out
				</Button>
			</header>

			<form onSubmit={event => void addTeam(event)} className="mb-3 flex shrink-0 gap-1">
				<Input
					value={name}
					onChange={event => {
						setName(event.target.value)
					}}
					placeholder="Team name"
					aria-label="New team name"
				/>
				<Button type="submit" disabled={pending}>
					{pending && <Spinner />}
					<Plus /> Add team
				</Button>
			</form>
			{error && (
				<p className="text-destructive mb-2 shrink-0 text-xs" role="alert">
					{error}
				</p>
			)}

			<ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
				{pipe(
					state.value.teams,
					Array.map(team => <TeamRow key={team.id} credentials={input.credentials} team={team} />)
				)}
			</ul>
		</main>
	)
}

function AdminRoute() {
	const [credentials, setCredentials] = useState<Credentials | null>(null)
	return credentials ? (
		<AdminPanel
			credentials={credentials}
			signOut={() => {
				setCredentials(null)
			}}
		/>
	) : (
		<Login onAuthenticated={setCredentials} />
	)
}
