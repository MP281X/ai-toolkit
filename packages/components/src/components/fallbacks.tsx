import {OctagonAlert} from 'lucide-react'

import {Alert, AlertDescription, AlertTitle} from '#components/ui/alert.tsx'
import {Button} from '#components/ui/button.tsx'
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
			<div className="animation-duration-[2.5s] size-8 animate-spin border-2 border-muted-foreground/50" />
		</div>
	)
}

export function Error(props: {error: Error; reset: () => void}) {
	const message = formatError(props.error)

	return (
		<Button
			variant="ghost"
			onClick={props.reset}
			className="flex flex-1 cursor-pointer select-text items-center justify-center p-4"
		>
			<Alert variant="destructive" className="w-full max-w-lg">
				<OctagonAlert />
				<AlertTitle>Something went wrong</AlertTitle>
				<AlertDescription className="wrap-break-word whitespace-pre-wrap">{message}</AlertDescription>
			</Alert>
		</Button>
	)
}
