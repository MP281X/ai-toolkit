import {Array, DateTime, Predicate, Schema, String} from 'effect'

import {
	ArrowLeftIcon,
	ArrowRightIcon,
	BugIcon,
	CircleAlertIcon,
	CircleIcon,
	ExternalLinkIcon,
	FileClockIcon,
	InfoIcon,
	RotateCwIcon,
	Trash2Icon,
	TriangleAlertIcon
} from 'lucide-react'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

import {Fallback, Loading} from '#components/fallbacks.tsx'
import {Button} from '#components/ui/button.tsx'
import {Input} from '#components/ui/input.tsx'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '#components/ui/resizable.tsx'
import {cn, formatTimestamp} from '#lib/utils.ts'

function browserUrl(origin: string, rest: string) {
	return `${origin}${String.startsWith('/')(rest) ? rest : `/${rest}`}`
}

function originLabel(origin: string) {
	if (origin === '') return 'localhost:0000'

	try {
		const url = new URL(origin)
		return url.host
	} catch {
		return String.replace(/^https?:\/\//u, '')(origin)
	}
}

const BrowserMessage = Schema.Union([
	Schema.Struct({deslopBrowserFavicon: Schema.Literal(true), href: Schema.optional(Schema.String)}),
	Schema.Struct({deslopBrowserLocation: Schema.Literal(true), path: Schema.optional(Schema.String)}),
	Schema.Struct({deslopBrowserLog: Schema.Literal(true), level: Schema.String, message: Schema.String})
])

function logLevelClassName(level: string) {
	if (level === 'error') return 'text-destructive'
	if (level === 'warn') return 'text-chart-2'
	if (level === 'info') return 'text-chart-1'
	if (level === 'debug') return 'text-chart-4'

	return 'text-muted-foreground'
}

function LogLevelIcon(props: {readonly level: string}) {
	if (props.level === 'error') return <CircleAlertIcon className="size-3.5" />
	if (props.level === 'warn') return <TriangleAlertIcon className="size-3.5" />
	if (props.level === 'info') return <InfoIcon className="size-3.5" />
	if (props.level === 'debug') return <BugIcon className="size-3.5" />

	return <CircleIcon className="size-2" />
}

function isIgnoredBrowserLog(message: string) {
	const lower = String.toLowerCase(message)

	return (
		String.startsWith('[vite]')(message) ||
		String.includes('react scan')(lower) ||
		String.includes('react-scan')(lower) ||
		String.includes('react grab')(lower) ||
		String.includes('react-grab')(lower)
	)
}

export function Browser(props: {readonly className?: string; readonly origin?: string}) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const logIdRef = useRef(0)
	const origin = props.origin ?? ''
	const [currentUrl, setCurrentUrl] = useState(() => (origin ? browserUrl(origin, '/') : ''))
	const [frameKey, setFrameKey] = useState(0)
	const [address, setAddress] = useState('/')
	const [faviconUrl, setFaviconUrl] = useState<string>()
	const [isListening, setIsListening] = useState(false)
	const [isLoading, setIsLoading] = useState(() => origin !== '')
	const [logs, setLogs] = useState<
		readonly {readonly id: number; readonly level: string; readonly message: string; readonly time: DateTime.Utc}[]
	>([])

	useEffect(() => {
		setAddress('/')
		setCurrentUrl(origin ? browserUrl(origin, '/') : '')
		setFaviconUrl(undefined)
		setIsLoading(origin !== '')
	}, [origin])

	useLayoutEffect(() => {
		setIsListening(false)

		function onMessage(event: MessageEvent<unknown>) {
			if (event.origin !== origin) return
			if (!Schema.is(BrowserMessage)(event.data)) return

			if ('deslopBrowserFavicon' in event.data) {
				setFaviconUrl(event.data.href)
				return
			}

			if ('deslopBrowserLocation' in event.data) {
				setAddress(event.data.path ?? '/')
				return
			}

			addLog(event.data.level, event.data.message)
		}

		window.addEventListener('message', onMessage)
		setIsListening(true)

		return () => {
			window.removeEventListener('message', onMessage)
			setIsListening(false)
		}
	}, [origin])

	function navigate() {
		if (String.isEmpty(origin)) return

		const nextUrl = browserUrl(origin, String.trim(address) || '/')

		setLogs([])
		setCurrentUrl(nextUrl)
		setFaviconUrl(undefined)
		setIsLoading(true)
	}

	function reload() {
		setLogs([])
		setIsLoading(true)
		setFrameKey(key => key + 1)
	}

	function clearCookies() {
		if (String.isEmpty(origin)) return

		setLogs([])
		iframeRef.current?.contentWindow?.postMessage({deslopBrowserClear: true}, origin)
	}

	function openTopLevel() {
		if (String.isEmpty(currentUrl)) return

		window.open(currentUrl, '_blank', 'noopener,noreferrer')
	}

	function goBack() {
		try {
			iframeRef.current?.contentWindow?.history.back()
		} catch {}
	}

	function goForward() {
		try {
			iframeRef.current?.contentWindow?.history.forward()
		} catch {}
	}

	function addLog(level: string, message: string) {
		if (isIgnoredBrowserLog(message)) return

		logIdRef.current += 1
		setLogs(current => [
			...Array.drop(current, -199),
			{id: logIdRef.current, level, message, time: DateTime.nowUnsafe()}
		])
	}

	return (
		<div
			className={cn(
				'bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border',
				props.className
			)}
		>
			<form
				className="bg-muted/30 flex shrink-0 items-center gap-1 border-b p-2"
				onSubmit={event => {
					event.preventDefault()
					navigate()
				}}
			>
				<Button type="button" variant="outline" size="icon" aria-label="Back" onClick={goBack}>
					<ArrowLeftIcon className="size-3.5" />
				</Button>
				<Button type="button" variant="outline" size="icon" aria-label="Forward" onClick={goForward}>
					<ArrowRightIcon className="size-3.5" />
				</Button>
				<Button type="button" variant="outline" size="icon" aria-label="Reload" onClick={reload}>
					<RotateCwIcon className="size-3.5" />
				</Button>
				<div className="border-border flex h-8 w-8 shrink-0 items-center justify-center border">
					{Predicate.isNotUndefined(faviconUrl) && <img src={faviconUrl} alt="" className="size-4" />}
				</div>
				<div className="flex min-w-0 flex-1 items-center gap-1">
					<div className="border-input bg-secondary text-secondary-foreground/70 flex h-8 min-w-0 shrink items-center border px-2 text-xs">
						<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{originLabel(origin)}</span>
					</div>
					<Input
						value={String.startsWith('/')(address) ? String.slice(1)(address) : address}
						placeholder=""
						className="min-w-[7rem] flex-1 text-xs"
						onChange={event => {
							setAddress(`/${String.replace(/^\/+/u, '')(event.currentTarget.value)}`)
						}}
					/>
				</div>
				<Button type="button" variant="outline" size="icon" aria-label="Open top-level preview" onClick={openTopLevel}>
					<ExternalLinkIcon className="size-3.5" />
				</Button>
				{origin && (
					<Button type="button" variant="outline" size="icon" aria-label="Clear cookies" onClick={clearCookies}>
						<Trash2Icon className="size-3.5" />
					</Button>
				)}
			</form>
			<div className="flex min-h-0 flex-1 flex-col">
				{origin === '' ? (
					<Fallback message="Start a dev server in this worktree terminal to open a browser preview." />
				) : (
					<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
						<ResizablePanel defaultSize="100%" minSize="40%">
							<div className="relative h-full min-h-0 w-full">
								<iframe
									ref={iframeRef}
									key={frameKey}
									title={currentUrl}
									src={isListening ? currentUrl : undefined}
									sandbox="allow-downloads allow-forms allow-modals allow-popups allow-scripts"
									className="bg-background h-full min-h-0 w-full border-0"
									onLoad={() => {
										setIsLoading(false)
									}}
								/>
								{isLoading && (
									<div className="bg-background absolute inset-0 flex">
										<Loading />
									</div>
								)}
							</div>
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel collapsible collapsedSize={0} defaultSize={0} minSize={0} maxSize="50%">
							<div className="flex h-full min-h-0 flex-col overflow-hidden">
								<div className={cn('min-h-0 flex-1 overflow-auto font-mono text-xs', logs.length === 0 && 'hidden')}>
									{Array.map(logs, log => (
										<div key={log.id} className="grid grid-cols-[8rem_1rem_minmax(0,1fr)] gap-3 px-2 py-1">
											<span className="overflow-hidden whitespace-nowrap select-none">{formatTimestamp(log.time)}</span>
											<span
												className={cn('flex shrink-0 items-center select-none', logLevelClassName(log.level))}
												title={log.level}
											>
												<LogLevelIcon level={log.level} />
											</span>
											<span className="min-w-0 break-words whitespace-pre-wrap select-text">{log.message}</span>
										</div>
									))}
								</div>
							</div>
						</ResizablePanel>
					</ResizablePanelGroup>
				)}
				<div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
					<div className="flex items-center gap-2 font-mono text-xs">
						<FileClockIcon className="size-3.5" />
						<span>{logs.length}</span>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Clear browser logs"
						onClick={() => {
							setLogs([])
						}}
					>
						<Trash2Icon className="size-3.5" />
					</Button>
				</div>
			</div>
		</div>
	)
}
