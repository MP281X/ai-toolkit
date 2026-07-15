import {Schema} from 'effect'

import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'

import {apiUrl} from '#lib/api.ts'
import {Button} from '@deslop/components/ui/button'
import {Input} from '@deslop/components/ui/input'
import {Spinner} from '@deslop/components/ui/spinner'

export const Route = createFileRoute('/admin/login')({component: AdminLogin})

function AdminLogin() {
	const navigate = useNavigate()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		if (pending) return

		setPending(true)
		setError('')
		try {
			const response = await fetch(apiUrl('/api/admin/session'), {
				body: Schema.encodeUnknownSync(Schema.UnknownFromJsonString)({password, username}),
				credentials: 'include',
				headers: {'content-type': 'application/json'},
				method: 'POST'
			})
			if (response.status !== 204) {
				setError('Invalid username or password.')
				return
			}
			await navigate({to: '/admin'})
		} catch {
			setError('Could not sign in.')
		} finally {
			setPending(false)
		}
	}

	return (
		<main className="bg-background text-foreground grid min-h-dvh place-items-center p-4">
			<form className="grid w-full max-w-xs gap-3" onSubmit={event => void submit(event)}>
				<label className="grid gap-1 text-xs">
					<span className="text-muted-foreground">Username</span>
					<Input
						autoComplete="username"
						value={username}
						onChange={event => {
							setUsername(event.target.value)
						}}
					/>
				</label>
				<label className="grid gap-1 text-xs">
					<span className="text-muted-foreground">Password</span>
					<Input
						autoComplete="current-password"
						type="password"
						value={password}
						onChange={event => {
							setPassword(event.target.value)
						}}
					/>
				</label>
				{error && (
					<p className="text-destructive text-xs" role="alert">
						{error}
					</p>
				)}
				<Button type="submit" disabled={pending}>
					{pending && <Spinner />} Sign in
				</Button>
			</form>
		</main>
	)
}
