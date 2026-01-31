import type {ErrorSchema} from '@ai-toolkit/ai/schemas'

import {Alert, AlertDescription, AlertTitle} from '#components/ui/alert.tsx'
import {formatError} from '#lib/utils.ts'

export function Error(props: ErrorSchema) {
	return (
		<Alert variant="destructive">
			<AlertTitle>Error</AlertTitle>
			<AlertDescription>
				<pre>{formatError(props.error)}</pre>
			</AlertDescription>
		</Alert>
	)
}
