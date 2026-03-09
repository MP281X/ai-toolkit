import type {FilePart} from '@ai-toolkit/ai/schema'
import {PaperclipIcon} from 'lucide-react'

export function Attachment(props: {part: FilePart}) {
	if (props.part.mediaType.startsWith('image/')) {
		return (
			<div className="border-border/40 border-y py-2">
				<button
					type="button"
					onClick={() => {
						const binary = atob(props.part.data)
						const bytes = new Uint8Array(binary.length)
						for (let index = 0; index < binary.length; index++) {
							bytes[index] = binary.charCodeAt(index)
						}
						const url = URL.createObjectURL(new Blob([bytes], {type: props.part.mediaType}))
						window.open(url, '_blank')
						setTimeout(() => URL.revokeObjectURL(url), 1000)
					}}
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
			onClick={() => {
				const binary = atob(props.part.data)
				const bytes = new Uint8Array(binary.length)
				for (let index = 0; index < binary.length; index++) {
					bytes[index] = binary.charCodeAt(index)
				}
				const url = URL.createObjectURL(new Blob([bytes], {type: props.part.mediaType}))
				window.open(url, '_blank')
				setTimeout(() => URL.revokeObjectURL(url), 1000)
			}}
			className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-[12px] hover:bg-muted/50"
		>
			<PaperclipIcon className="size-3 text-muted-foreground" />
			<span className="max-w-48 truncate">{props.part.filename}</span>
		</button>
	)
}
