import {DateTime, String} from 'effect'

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

import {Error as ErrorFallback, Loading} from '#components/fallbacks.tsx'
import {Button} from '#components/ui/button.tsx'
import {InputGroup, InputGroupInput} from '#components/ui/input-group.tsx'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '#components/ui/resizable.tsx'
import {Select, SelectContent, SelectItem, SelectTrigger} from '#components/ui/select.tsx'
import {cn, formatTimestamp} from '#lib/utils.ts'

function browserOrigin(port: string) {
	return `${window.location.protocol}//${port}.localhost:${window.location.port}`
}

function browserUrl(port: string, rest: string) {
	return `${browserOrigin(port)}${rest.startsWith('/') ? rest : `/${rest}`}`
}

type BrowserLog = {readonly id: number; readonly level: string; readonly message: string; readonly time: DateTime.Utc}

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
	const lower = message.toLowerCase()

	return (
		message.startsWith('[vite]') ||
		lower.includes('react scan') ||
		lower.includes('react-scan') ||
		lower.includes('react grab') ||
		lower.includes('react-grab')
	)
}

function BrowserLogsHeader(props: {readonly count: number; readonly onClear: () => void}) {
	return (
		<div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
			<div className="flex items-center gap-2">
				<FileClockIcon className="size-3.5" />
				<span>{props.count}</span>
			</div>
			<Button type="button" variant="ghost" size="icon-xs" aria-label="Clear browser logs" onClick={props.onClear}>
				<Trash2Icon className="size-3.5" />
			</Button>
		</div>
	)
}

export function Browser(props: {readonly className?: string; readonly ports: readonly number[]}) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const logIdRef = useRef(0)
	const [port, setPort] = useState(() => props.ports[0]?.toString() ?? '')
	const [currentUrl, setCurrentUrl] = useState(() => (props.ports[0] ? browserUrl(props.ports[0].toString(), '/') : ''))
	const [frameKey, setFrameKey] = useState(0)
	const [address, setAddress] = useState('/')
	const [faviconUrl, setFaviconUrl] = useState<string>()
	const [isListening, setIsListening] = useState(false)
	const [isLoading, setIsLoading] = useState(() => props.ports.length > 0)
	const [logs, setLogs] = useState<readonly BrowserLog[]>([])
	const alternatePorts = props.ports.filter(nextPort => nextPort.toString() !== port)

	useEffect(() => {
		const nextPort = props.ports.includes(Number(port)) ? port : (props.ports[0]?.toString() ?? '')
		if (nextPort === port) return

		setPort(nextPort)
		setCurrentUrl(nextPort ? browserUrl(nextPort, address) : '')
		setFaviconUrl(undefined)
		setIsLoading(nextPort !== '')
	}, [address, port, props.ports])

	useLayoutEffect(() => {
		setIsListening(false)

		function onMessage(event: MessageEvent) {
			if (event.origin !== browserOrigin(port)) return
			if (typeof event.data !== 'object' || event.data === null) return

			if (event.data.__deslopBrowserFavicon === true) {
				setFaviconUrl(typeof event.data.href === 'string' ? event.data.href : undefined)
				return
			}

			if (event.data.__deslopBrowserLog !== true) return
			if (typeof event.data.level !== 'string' || typeof event.data.message !== 'string') return

			addLog(event.data.level, event.data.message)
		}

		window.addEventListener('message', onMessage)
		setIsListening(true)

		return () => {
			window.removeEventListener('message', onMessage)
			setIsListening(false)
		}
	}, [port])

	function navigate() {
		if (!port) return

		const nextUrl = browserUrl(port, String.trim(address) || '/')

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
		if (!port) return

		setLogs([])
		iframeRef.current?.contentWindow?.postMessage({__deslopBrowserClear: true}, browserOrigin(port))
	}

	function openTopLevel() {
		if (!currentUrl) return

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

		setLogs(current => [...current.slice(-199), {id: logIdRef.current++, level, message, time: DateTime.nowUnsafe()}])
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
					{faviconUrl && <img src={faviconUrl} alt="" className="size-4" />}
				</div>
				<InputGroup className="border-foreground/25 flex-1">
					<Select
						disabled={alternatePorts.length === 0}
						value={port}
						onValueChange={nextPort => {
							if (nextPort === null) return

							setPort(nextPort)
							setLogs([])
							setCurrentUrl(browserUrl(nextPort, String.trim(address) || '/'))
							setFaviconUrl(undefined)
							setIsLoading(true)
						}}
					>
						<SelectTrigger className="text-muted-foreground w-auto min-w-0 border-0 bg-transparent dark:bg-transparent [&_svg]:hidden">
							<span>http://localhost:{port || '0000'}/</span>
						</SelectTrigger>
						{alternatePorts.length > 0 && (
							<SelectContent alignItemWithTrigger={true}>
								{alternatePorts.map(port => (
									<SelectItem key={port} value={port.toString()} className="[&>span:last-child]:hidden">
										http://localhost:{port}/
									</SelectItem>
								))}
							</SelectContent>
						)}
					</Select>
					<InputGroupInput
						value={address.startsWith('/') ? address.slice(1) : address}
						placeholder="path?query"
						className="pl-0!"
						onChange={event => {
							setAddress(`/${event.currentTarget.value.replace(/^\/+/, '')}`)
						}}
					/>
				</InputGroup>
				<Button type="button" variant="outline" size="icon" aria-label="Open top-level preview" onClick={openTopLevel}>
					<ExternalLinkIcon className="size-3.5" />
				</Button>
				{port && (
					<Button type="button" variant="outline" size="icon" aria-label="Clear cookies" onClick={clearCookies}>
						<Trash2Icon className="size-3.5" />
					</Button>
				)}
			</form>
			<div className="flex min-h-0 flex-1 flex-col">
				{props.ports.length === 0 ? (
					<ErrorFallback
						error={new Error('Start a dev server in this worktree terminal to open a browser preview.')}
						reset={() => {}}
					/>
				) : (
					<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
						<ResizablePanel defaultSize="100%" minSize="40%">
							<div className="relative h-full min-h-0 w-full">
								<iframe
									ref={iframeRef}
									key={frameKey}
									title={currentUrl}
									src={isListening ? currentUrl : undefined}
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
								<div className={cn('min-h-0 flex-1 overflow-auto', logs.length === 0 && 'hidden')}>
									{logs.map(log => (
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
				<BrowserLogsHeader
					count={logs.length}
					onClear={() => {
						setLogs([])
					}}
				/>
			</div>
		</div>
	)
}
