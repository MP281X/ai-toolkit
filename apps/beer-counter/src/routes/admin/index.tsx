import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Predicate, Schema, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult} from 'effect/unstable/reactivity'
import {useState} from 'react'

import {apiUrl} from '#lib/api.ts'
import {RpcClient} from '#lib/atomRuntime.ts'
import {counterStateAtom} from '#lib/state.ts'
import {CounterError, type Team} from '#rpcs/contracts.ts'
import {Form, useForm} from '@deslop/components/form'
import {Minus, Pencil, Plus, Save, Trash2} from '@deslop/components/icons'
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

export const Route = createFileRoute('/admin/')({component: Admin})

const adminStatusAtom = RpcClient.query('auth.status', {})

function isAuthenticationError(cause: unknown) {
	return cause instanceof CounterError && cause.reason === 'auth'
}

function AuthDialog(input: {readonly open: boolean}) {
	const form = useForm({
		defaultValues: {token: ''},
		onSubmit: async event => {
			const response = await fetch(apiUrl('/api/admin/login'), {
				body: Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(event.value),
				credentials: 'include',
				headers: {'content-type': 'application/json'},
				method: 'POST'
			})
			if (!response.ok) throw new CounterError({message: 'Authentication required.', reason: 'auth'})
			location.reload()
		}
	})

	return (
		<Dialog open={input.open}>
			<DialogContent showCloseButton={false}>
				<DialogTitle className="sr-only">Admin access</DialogTitle>
				<Form form={form} className="block">
					<div className="grid gap-3">
						<form.AppField name="token">{field => <field.PasswordField />}</form.AppField>
						<form.SubmitButton>Sign in</form.SubmitButton>
					</div>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

type TeamAction = 'add' | 'subtract' | 'rename' | 'remove'

function TeamRow(input: {readonly onAuthenticationRequired: () => void; readonly team: Team}) {
	const adjust = useAtomSet(RpcClient.mutation('admin.adjust'), {mode: 'promise'})
	const rename = useAtomSet(RpcClient.mutation('admin.rename'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('admin.remove'), {mode: 'promise'})
	const [delta, setDelta] = useState('1')
	const [nameDraft, setNameDraft] = useState<string>()
	const [pending, setPending] = useState<TeamAction | null>(null)
	const [error, setError] = useState('')
	const [confirmingDelete, setConfirmingDelete] = useState(false)
	const name = nameDraft ?? input.team.name

	async function run(action: TeamAction, command: () => Promise<unknown>) {
		if (Predicate.isNotNull(pending)) return false
		setPending(action)
		setError('')
		try {
			await command()
			return true
		} catch (cause) {
			setError(formatError(cause))
			if (isAuthenticationError(cause)) input.onAuthenticationRequired()
			return false
		} finally {
			setPending(null)
		}
	}

	async function renameTeam() {
		const succeeded = await run('rename', () => rename({payload: {id: input.team.id, name}}))
		if (succeeded) setNameDraft(undefined)
	}

	async function deleteTeam() {
		const succeeded = await run('remove', () => remove({payload: {id: input.team.id}}))
		if (succeeded) setConfirmingDelete(false)
	}

	async function adjustTeam(direction: 'add' | 'subtract') {
		const succeeded = await run(direction, () =>
			adjust({payload: {amount: Number(delta), direction, id: input.team.id}})
		)
		if (succeeded) setDelta('1')
	}

	function renameIcon() {
		if (pending === 'rename') return <Spinner />
		if (name === input.team.name) return <Pencil />
		return <Save />
	}

	return (
		<li className="border-border grid min-h-12 grid-cols-[3rem_4.5rem_repeat(3,2rem)] items-center gap-1 border-b py-1 sm:grid-cols-[minmax(8rem,1fr)_3.5rem_4.5rem_auto_auto_auto]">
			<div className="col-span-full flex min-w-0 items-center gap-1 sm:col-span-1">
				<Input
					aria-label={`Name for ${input.team.name}`}
					className="min-w-0"
					disabled={pending === 'rename'}
					value={name}
					onChange={event => {
						setNameDraft(event.target.value)
					}}
				/>
				<Button
					aria-label={`Save name for ${input.team.name}`}
					disabled={Predicate.isNotNull(pending) || name === input.team.name}
					onClick={() => void renameTeam()}
					size="icon"
					title="Save team name"
					type="button"
					variant="ghost"
				>
					{renameIcon()}
				</Button>
			</div>
			<strong className="text-center text-lg tabular-nums" aria-label={`${input.team.count} confirmed`}>
				{input.team.count}
			</strong>
			<Input
				aria-label={`Delta for ${input.team.name}`}
				className="text-center tabular-nums"
				inputMode="numeric"
				min="1"
				step="1"
				type="number"
				value={delta}
				onChange={event => {
					setDelta(event.target.value)
				}}
			/>
			<Button
				aria-label={`Subtract from ${input.team.name}`}
				disabled={Predicate.isNotNull(pending)}
				onClick={() => {
					void adjustTeam('subtract')
				}}
				size="icon"
				type="button"
				variant="outline"
			>
				{pending === 'subtract' ? <Spinner /> : <Minus />}
			</Button>
			<Button
				aria-label={`Add to ${input.team.name}`}
				disabled={Predicate.isNotNull(pending)}
				onClick={() => {
					void adjustTeam('add')
				}}
				size="icon"
				type="button"
			>
				{pending === 'add' ? <Spinner /> : <Plus />}
			</Button>
			<Button
				aria-label={`Delete ${input.team.name}`}
				disabled={Predicate.isNotNull(pending)}
				onClick={() => {
					setConfirmingDelete(true)
				}}
				size="icon"
				type="button"
				variant="destructive"
			>
				<Trash2 />
			</Button>
			{error && (
				<p className="text-destructive col-span-full text-xs" role="alert">
					{error}
				</p>
			)}

			<Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete {input.team.name}?</DialogTitle>
						<DialogDescription>This deletes the team and its confirmed count.</DialogDescription>
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
							onClick={() => void deleteTeam()}
						>
							{pending === 'remove' && <Spinner />} Delete team
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	)
}

function Admin() {
	const adminStatus = useAtomSuspense(adminStatusAtom, {includeFailure: true})
	const state = useAtomSuspense(counterStateAtom)
	const add = useAtomSet(RpcClient.mutation('admin.add'), {mode: 'promise'})
	const [authenticationRequired, setAuthenticationRequired] = useState(false)
	const [name, setName] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')

	async function addTeam(event: React.FormEvent) {
		event.preventDefault()
		if (pending) return
		setPending(true)
		setError('')
		try {
			await add({payload: {name}})
			setName('')
		} catch (cause) {
			setError(formatError(cause))
			if (isAuthenticationError(cause)) setAuthenticationRequired(true)
		} finally {
			setPending(false)
		}
	}

	return (
		<>
			<main className="bg-background text-foreground mx-auto flex h-dvh w-full max-w-7xl flex-col overflow-hidden p-2 sm:p-4">
				<form
					className="border-border grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-1 border-b pb-2"
					onSubmit={event => void addTeam(event)}
				>
					<Input
						aria-label="New team name"
						placeholder="Team name"
						value={name}
						onChange={event => {
							setName(event.target.value)
						}}
					/>
					<Button type="submit" disabled={pending}>
						{pending ? <Spinner /> : <Plus />} Add team
					</Button>
					{error && (
						<p className="text-destructive col-span-full text-xs" role="alert">
							{error}
						</p>
					)}
				</form>
				<ul className="min-h-0 flex-1 overflow-y-auto sm:grid sm:auto-rows-fr">
					{pipe(
						state.value.teams,
						Array.map(team => (
							<TeamRow
								key={team.id}
								onAuthenticationRequired={() => {
									setAuthenticationRequired(true)
								}}
								team={team}
							/>
						))
					)}
				</ul>
			</main>
			<AuthDialog open={authenticationRequired || AsyncResult.isFailure(adminStatus)} />
		</>
	)
}
