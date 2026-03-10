'use client'

import {FileIcon, ImageIcon} from '#components/icons.tsx'

export function Attachment(props: {file: globalThis.File}) {
	const url = URL.createObjectURL(props.file)
	const image = props.file.type.startsWith('image/')

	if (image) {
		return (
			<a className="block max-w-72 overflow-hidden border border-border" href={url} rel="noreferrer" target="_blank">
				<img alt={props.file.name} className="max-h-64 w-full object-cover" src={url} />
			</a>
		)
	}

	return (
		<a
			className="flex items-center gap-2 border border-border px-2 py-1 text-xs"
			href={url}
			rel="noreferrer"
			target="_blank"
		>
			{props.file.name.length > 0 ? <FileIcon filePath={props.file.name} /> : <ImageIcon className="size-3.5" />}
			<span>{props.file.name}</span>
		</a>
	)
}
