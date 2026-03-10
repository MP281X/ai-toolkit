import type {FilePart} from '@ai-toolkit/ai/schema'
import {PaperclipIcon} from 'lucide-react'

export function Attachment(props: {part: FilePart}) {
	const url = URL.createObjectURL(props.part.file)

	if (props.part.file.type.startsWith('image/') && url) {
		return (
			<div className="border-border/40 border-y py-2">
				<button
					type="button"
					onClick={() => window.open(url, '_blank')}
					className="block max-w-sm cursor-pointer hover:opacity-90"
					title={props.part.file.name}
				>
					<img src={url} alt={props.part.file.name} className="max-h-64 w-full border border-border object-contain" />
				</button>
			</div>
		)
	}

	return (
		<button
			type="button"
			onClick={() => url && window.open(url, '_blank')}
			className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-[12px] hover:bg-muted/50"
		>
			<PaperclipIcon className="size-3 text-muted-foreground" />
			<span className="max-w-48 truncate">{props.part.file.name}</span>
		</button>
	)
}
