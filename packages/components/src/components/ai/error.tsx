import type {ErrorPart} from '@ai-toolkit/ai/schema'

import {formatError} from '#lib/utils.ts'

export function Error(props: {part: ErrorPart}) {
	return (
		<pre className="overflow-x-auto whitespace-pre-wrap py-0.5 font-mono text-[11px] text-destructive leading-snug">
			{formatError(props.part.error)}
		</pre>
	)
}
