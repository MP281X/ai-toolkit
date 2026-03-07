import type {FilePart} from '@ai-toolkit/ai/schema'
import {PaperclipIcon} from 'lucide-react'

function openAttachment(part: FilePart) {
	const binary = atob(part.data)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index)
	}

	const blob = new Blob([bytes], {type: part.mediaType})
	const url = URL.createObjectURL(blob)
	const opened = window.open(url, '_blank')
	if (opened) {
		setTimeout(() => URL.revokeObjectURL(url), 1_000)
		return
	}

	window.location.href = url
}

export function Attachment(props: {part: FilePart}) {
	const isImage = props.part.mediaType.startsWith('image/')

	if (isImage) {
		return (
			<div className="border-border/40 border-y py-2">
				<button
					type="button"
					onClick={() => openAttachment(props.part)}
					className="block max-w-sm cursor-pointer hover:opacity-90"
					title={props.part.filename}
				>
					<img
						src={`data:${props.part.mediaType};base64,${props.part.data}`}
						alt={props.part.filename}
						className="max-h-64 w-full border border-border object-contain"
					/>
				</button>
			</div>
		)
	}

	return (
		<button
			type="button"
			onClick={() => openAttachment(props.part)}
			className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-[12px] hover:bg-muted/50"
		>
			<PaperclipIcon className="size-3 text-muted-foreground" />
			<span className="max-w-48 truncate">{props.part.filename}</span>
		</button>
	)
}
