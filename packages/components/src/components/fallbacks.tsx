import {useAtomSet} from '@effect/atom-react'

import {Effect, pipe} from 'effect'

import * as Atom from 'effect/unstable/reactivity/Atom'
import {InfoIcon, OctagonAlert} from 'lucide-react'

import {Alert, AlertDescription, AlertTitle} from '#components/ui/alert.tsx'
import {Button} from '#components/ui/button.tsx'
import {Spinner} from '#components/ui/spinner.tsx'
import {formatError} from '#lib/utils.ts'

export function NotFound() {
	return (
		<div className="flex flex-1 items-center justify-center p-4">
			<Alert variant="destructive" className="w-full max-w-lg">
				<OctagonAlert />
				<AlertTitle>Page not found</AlertTitle>
				<AlertDescription>Error 404</AlertDescription>
			</Alert>
		</div>
	)
}

export function Loading() {
	return (
		<div className="flex flex-1 items-center justify-center">
			<Spinner className="text-muted-foreground size-4 border opacity-60" />
		</div>
	)
}

export function Error(props: {error: unknown; reset: () => void}) {
	const message = formatError(props.error)
	const resetAndCopy = useAtomSet(
		Atom.fn((text: string) =>
			pipe(Effect.sync(props.reset), Effect.andThen(Effect.tryPromise(() => navigator.clipboard.writeText(text))))
		)
	)

	return (
		<Button
			variant="ghost"
			onClick={() => {
				resetAndCopy(message)
			}}
			className="flex h-full w-full cursor-pointer items-center justify-center p-4 select-text"
		>
			<Alert variant="destructive" className="w-full max-w-lg">
				<OctagonAlert />
				<AlertTitle>Something went wrong</AlertTitle>
				<AlertDescription className="wrap-break-word whitespace-pre-wrap">{message}</AlertDescription>
			</Alert>
		</Button>
	)
}

export function Fallback(props: {message: string}) {
	return (
		<div className="flex h-full w-full items-center justify-center p-4 select-text">
			<Alert className="w-fit max-w-lg">
				<InfoIcon />
				<AlertDescription className="wrap-break-word whitespace-pre-wrap">{props.message}</AlertDescription>
			</Alert>
		</div>
	)
}
