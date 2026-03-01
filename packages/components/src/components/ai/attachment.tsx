import type {FilePart} from '@ai-toolkit/ai/schema'

function openAttachment(attachment: FilePart) {
	const binary = atob(attachment.data)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	const blob = new Blob([bytes], {type: attachment.mediaType})
	const url = URL.createObjectURL(blob)
	const opened = window.open(url, '_blank')
	if (!opened) window.location.href = url
	else setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Attachment(props: FilePart) {
	return (
		<button
			type="button"
			onClick={() => openAttachment(props)}
			className="flex items-center gap-2 border border-border px-2 py-1.5 text-left text-[11px]"
		>
			{props.mediaType.startsWith('image/') ? (
				<img
					src={`data:${props.mediaType};base64,${props.data}`}
					alt={props.filename}
					className="h-10 w-16 shrink-0 border border-border object-cover"
				/>
			) : (
				<div className="flex h-10 w-16 shrink-0 items-center justify-center border border-border bg-muted font-mono text-[10px] text-muted-foreground">
					FILE
				</div>
			)}
			<span className="truncate text-foreground">{props.filename}</span>
		</button>
	)
}
