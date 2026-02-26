import type {FilePart} from '@ai-toolkit/ai/schema'

function openAttachment(attachment: FilePart) {
	const binary = atob(attachment.data)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
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
			className="group flex items-center gap-3 border border-border/60 px-2 py-2"
		>
			<div className="flex w-32 shrink-0 items-center justify-center border border-border/60 bg-muted/30">
				{props.mediaType.startsWith('image/') ? (
					<img
						src={`data:${props.mediaType};base64,${props.data}`}
						alt={props.filename ?? 'Attachment'}
						className="h-24 w-full object-cover"
					/>
				) : (
					<div className="py-7 font-medium text-[10px] text-muted-foreground">FILE</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-[11px] text-muted-foreground">
					{props.mediaType.startsWith('image/') ? 'Image' : 'File'}
				</div>
				<div className="truncate font-medium text-[13px]">
					{props.filename ?? (props.mediaType.startsWith('image/') ? 'Pasted image' : 'Attachment')}
				</div>
			</div>
		</button>
	)
}
