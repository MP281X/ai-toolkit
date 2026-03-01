import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {
	ChevronRight,
	File,
	SiGnubash,
	SiMarkdown,
	SiReact,
	SiTypescript,
	SquareMinus,
	SquarePlus,
	Trash2
} from '@ai-toolkit/components/icons'
import {FullFile, PatchDiff} from '@ai-toolkit/components/render/diff'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {cn} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/diff/')({
	component: RouteComponent
})

function FileIcon(props: {filePath: string; className?: string}) {
	const ext = props.filePath.split('.').pop()?.toLowerCase()
	const cls = cn('size-3.5 shrink-0', props.className)

	if (ext === 'md' || ext === 'markdown') return <SiMarkdown className={cls} />
	if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return <SiGnubash className={cls} />
	if (ext === 'tsx' || ext === 'jsx') return <SiReact className={cn(cls, 'text-sky-400')} />
	if (ext === 'ts' || ext === 'js') return <SiTypescript className={cn(cls, 'text-blue-500')} />
	return <File className={cls} />
}

function FileEntry(props: {
	filePath: string
	old: string
	next: string
	onStage?: () => void
	onUnstage?: () => void
	onDiscard?: () => void
}) {
	const [view, setView] = useState<'diff' | 'raw'>('diff')
	const [isOpen, setIsOpen] = useState(false)
	const name = props.filePath.split('/').pop() ?? props.filePath
	const dir = props.filePath.includes('/') ? props.filePath.slice(0, props.filePath.lastIndexOf('/') + 1) : ''

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen} className="group border-b">
			<div className="flex items-center gap-2 bg-muted/40 px-3">
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left">
					<ChevronRight
						className={cn(
							'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
							isOpen ? 'rotate-90' : 'rotate-0'
						)}
					/>
					<FileIcon filePath={props.filePath} className="text-muted-foreground" />
					<span className="min-w-0 truncate font-mono text-xs">
						{dir && <span className="text-muted-foreground">{dir}</span>}
						<span className="font-semibold text-foreground">{name}</span>
					</span>
				</CollapsibleTrigger>
				<div className="flex shrink-0 items-center gap-2">
					<div className="flex shrink-0 items-center gap-1">
						{props.onStage != null && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-5 w-5 p-0"
								onClick={props.onStage}
								aria-label="Stage file"
								title="Stage"
							>
								<SquarePlus className="size-3.5" />
							</Button>
						)}
						{props.onUnstage != null && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-5 w-5 p-0"
								onClick={props.onUnstage}
								aria-label="Unstage file"
								title="Unstage"
							>
								<SquareMinus className="size-3.5" />
							</Button>
						)}
						{props.onDiscard != null && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-5 w-5 p-0 text-destructive hover:text-destructive"
								onClick={props.onDiscard}
								aria-label="Discard file"
								title="Discard"
							>
								<Trash2 className="size-3.5" />
							</Button>
						)}
					</div>
					<div className="flex shrink-0 items-center border bg-background p-0.5">
						<Button
							type="button"
							size="sm"
							variant={view === 'diff' ? 'secondary' : 'ghost'}
							className="h-5 px-2 font-mono text-[10px]"
							onClick={() => setView('diff')}
						>
							diff
						</Button>
						<Button
							type="button"
							size="sm"
							variant={view === 'raw' ? 'secondary' : 'ghost'}
							className="h-5 px-2 font-mono text-[10px]"
							onClick={() => setView('raw')}
						>
							raw
						</Button>
					</div>
				</div>
			</div>
			<CollapsibleContent>
				<div className="border-t bg-background">
					{view === 'diff' ? (
						<PatchDiff
							filePath={props.filePath}
							old={props.old}
							new={props.next}
							onStage={props.onStage}
							onUnstage={props.onUnstage}
							onDiscard={props.onDiscard}
						/>
					) : (
						<FullFile filePath={props.filePath} content={props.next} />
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

function GitSection(props: {
	label: string
	diffs: readonly {filePath: string; old: string; new: string}[]
	onStage?: (filePath: string) => void
	onUnstage?: (filePath: string) => void
	onDiscard?: (filePath: string) => void
}) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b md:border-r md:border-b-0 md:last:border-r-0">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
				<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">{props.label}</span>
				<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					{props.diffs.length}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{props.diffs.length === 0 ? (
					<div className="px-3 py-6 text-center text-muted-foreground text-xs">No changes</div>
				) : (
					props.diffs.map(diff => (
						<FileEntry
							key={diff.filePath}
							filePath={diff.filePath}
							old={diff.old}
							next={diff.new}
							onStage={props.onStage != null ? () => props.onStage?.(diff.filePath) : undefined}
							onUnstage={props.onUnstage != null ? () => props.onUnstage?.(diff.filePath) : undefined}
							onDiscard={props.onDiscard != null ? () => props.onDiscard?.(diff.filePath) : undefined}
						/>
					))
				)}
			</div>
		</div>
	)
}

function RouteComponent() {
	const {value: stagedDiffs} = useAtomSuspense(RpcClient.query('git.stagedDiffs', void 0))
	const {value: unstagedDiffs} = useAtomSuspense(RpcClient.query('git.unstagedDiffs', void 0))
	const stageFile = useAtomSet(RpcClient.mutation('git.stageFile'))
	const unstageFile = useAtomSet(RpcClient.mutation('git.unstageFile'))
	const discardFile = useAtomSet(RpcClient.mutation('git.discardFile'))

	const [removedFromStaged, setRemovedFromStaged] = useState<Set<string>>(new Set())
	const [removedFromUnstaged, setRemovedFromUnstaged] = useState<Set<string>>(new Set())

	const displayedStaged = stagedDiffs.filter(d => !removedFromStaged.has(d.filePath))
	const displayedUnstaged = unstagedDiffs.filter(d => !removedFromUnstaged.has(d.filePath))

	function handleUnstage(filePath: string) {
		unstageFile({payload: {filePath}})
		setRemovedFromStaged(prev => new Set([...prev, filePath]))
	}

	function handleStage(filePath: string) {
		stageFile({payload: {filePath}})
		setRemovedFromUnstaged(prev => new Set([...prev, filePath]))
	}

	function handleDiscardFile(filePath: string) {
		discardFile({payload: {filePath}})
		setRemovedFromStaged(prev => new Set([...prev, filePath]))
		setRemovedFromUnstaged(prev => new Set([...prev, filePath]))
	}

	return (
		<ResizablePanelGroup orientation="horizontal" className="h-dvh min-h-0 w-full bg-background">
			<ResizablePanel minSize="20%" defaultSize="50%" className="flex min-h-0">
				<GitSection label="Staged" diffs={displayedStaged} onUnstage={handleUnstage} onDiscard={handleDiscardFile} />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel minSize="20%" defaultSize="50%" className="flex min-h-0 min-w-0">
				<GitSection label="Unstaged" diffs={displayedUnstaged} onStage={handleStage} onDiscard={handleDiscardFile} />
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}
