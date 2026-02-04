import type {Error as ErrorSchema} from '@ai-toolkit/ai'

import {Alert, AlertDescription, AlertTitle} from '#components/ui/alert.tsx'
import {formatError} from '#lib/utils.ts'

export function Error(props: ErrorSchema) {
	return (
		<Alert variant="destructive" className="px-3 py-2 text-[11px]">
			<AlertDescription>
				<pre className="overflow-x-auto font-mono leading-snug">{formatError(props.error)}</pre>
			</AlertDescription>
		</Alert>
	)
}
