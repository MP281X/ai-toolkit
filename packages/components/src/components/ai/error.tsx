import type {ErrorPart} from '@ai-toolkit/ai/schema'
import {OctagonAlert} from 'lucide-react'

import {Alert, AlertDescription} from '#components/ui/alert.tsx'
import {formatError} from '#lib/utils.ts'

export function Error(props: ErrorPart) {
	return (
		<Alert variant="destructive">
			<OctagonAlert />
			<AlertDescription className="font-mono text-[11px] leading-snug">
				<pre className="overflow-x-auto whitespace-pre-wrap">{formatError(props.error)}</pre>
			</AlertDescription>
		</Alert>
	)
}
