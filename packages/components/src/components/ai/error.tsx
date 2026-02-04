import type {Error as ErrorSchema} from '@ai-toolkit/ai'

import {Alert, AlertDescription, AlertTitle} from '#components/ui/alert.tsx'
import {formatError} from '#lib/utils.ts'

export function Error(props: ErrorSchema) {
	return (
		<Alert variant="destructive" className="my-2">
			<AlertTitle className="uppercase tracking-wide">Error</AlertTitle>
			<AlertDescription>
				<pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-relaxed">{formatError(props.error)}</pre>
			</AlertDescription>
		</Alert>
	)
}
