import {formatError} from '#lib/utils.ts'

export function ErrorMessage(props: {error: unknown}) {
	return <pre className="overflow-x-auto whitespace-pre-wrap text-destructive text-xs">{formatError(props.error)}</pre>
}
