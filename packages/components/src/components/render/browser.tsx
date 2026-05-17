import {Array, Option, pipe, String} from 'effect'

import {RotateCwIcon} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

import {cn} from '#lib/utils.ts'

export function Browser(props: {readonly className?: string; readonly url: string}) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [currentUrl, setCurrentUrl] = useState(props.url)
	const [frameKey, setFrameKey] = useState(0)
	const [address, setAddress] = useState(props.url)
	const [faviconUrl, setFaviconUrl] = useState<string>()

	useEffect(() => {
		setCurrentUrl(props.url)
		setAddress(props.url)
		setFaviconUrl(undefined)
	}, [props.url])

	function navigate() {
		const nextUrl = String.trim(address)

		setAddress(nextUrl)
		setCurrentUrl(nextUrl)
		setFaviconUrl(undefined)
	}

	function updateFavicon() {
		try {
			setFaviconUrl(
				pipe(
					Array.fromIterable(iframeRef.current?.contentDocument?.head.children ?? []),
					Array.filter((element): element is HTMLLinkElement => element.tagName === 'LINK'),
					Array.findFirst(
						link => link.rel === 'shortcut icon' || pipe(link.rel, String.split(/\s+/), Array.contains('icon'))
					),
					Option.map(link => link.href),
					Option.getOrUndefined
				)
			)
		} catch {
			setFaviconUrl(undefined)
		}
	}

	return (
		<div
			className={cn(
				'bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border',
				props.className
			)}
		>
			<form
				className="bg-muted/30 flex h-10 shrink-0 items-center gap-2 border-b px-2"
				onSubmit={event => {
					event.preventDefault()
					navigate()
				}}
			>
				<div className="border-input bg-background flex size-7 shrink-0 items-center justify-center border">
					{faviconUrl && <img src={faviconUrl} alt="" className="size-4" />}
				</div>
				<input
					value={address}
					placeholder="localhost:3000"
					className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-7 min-w-0 flex-1 border px-2 font-mono text-xs outline-none focus-visible:ring-1"
					onChange={event => setAddress(event.currentTarget.value)}
				/>
				<button
					type="button"
					className="border-input bg-background text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center border"
					aria-label="Reload"
					onClick={() => setFrameKey(key => key + 1)}
				>
					<RotateCwIcon className="size-3.5" />
				</button>
			</form>
			<iframe
				ref={iframeRef}
				key={frameKey}
				title={currentUrl}
				src={currentUrl}
				className="min-h-0 flex-1 border-0 bg-white"
				onLoad={updateFavicon}
			/>
		</div>
	)
}
