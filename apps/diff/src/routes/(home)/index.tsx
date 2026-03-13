import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, pipe, Stream, String} from 'effect'

import {ChevronRight, FileIcon, SquareMinus, SquarePlus, Trash2} from '@ai-toolkit/components/icons'
import {PatchDiff} from '@ai-toolkit/components/render/diff'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

const stagedDiffsAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('git.stagedDiffs', void 0)),
			Stream.unwrap
		)
	)
)

const unstagedDiffsAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('git.unstagedDiffs', void 0)),
			Stream.unwrap
		)
	)
)

function RouteComponent() {
	const stagedDiffs = useAtomSuspense(stagedDiffsAtom).value
	const unstagedDiffs = useAtomSuspense(unstagedDiffsAtom).value
	const stageFile = useAtomSet(RpcClient.mutation('git.stageFile'))
	const unstageFile = useAtomSet(RpcClient.mutation('git.unstageFile'))
	const discardFile = useAtomSet(RpcClient.mutation('git.discardFile'))
	return (
		<ResizablePanelGroup orientation="horizontal" className="h-dvh min-h-0 w-full bg-background">
			<ResizablePanel minSize="20%" defaultSize="50%" className="flex min-h-0">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b md:border-r md:border-b-0">
					<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
						<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Staged</span>
						<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
							{stagedDiffs.length}
						</span>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{Array.map(stagedDiffs, diff => (
							<Collapsible key={diff.filePath} className="group border-b">
								<div className="flex items-center gap-2 bg-muted/40 px-3">
									<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left">
										<ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90" />
										<FileIcon filePath={diff.filePath} />
										<span className="min-w-0 truncate font-mono text-xs">
											{pipe(
												diff.filePath,
												String.split('/'),
												Array.matchRight({
													onEmpty: () => <span className="font-semibold text-foreground">{diff.filePath}</span>,
													onNonEmpty: (init, last) => (
														<>
															<span className="text-muted-foreground">{pipe(init, Array.join('/'))}/</span>
															<span className="font-semibold text-foreground">{last}</span>
														</>
													)
												})
											)}
										</span>
									</CollapsibleTrigger>
									<div className="flex shrink-0 items-center gap-2">
										<div className="flex shrink-0 items-center gap-1">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-5 w-5 p-0"
												onClick={() => unstageFile({payload: {filePath: diff.filePath}})}
												aria-label="Unstage file"
												title="Unstage"
											>
												<SquareMinus className="size-3.5" />
											</Button>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-5 w-5 p-0 text-destructive hover:text-destructive"
												onClick={() => discardFile({payload: {filePath: diff.filePath}})}
												aria-label="Discard file"
												title="Discard"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</div>
								</div>
								<CollapsibleContent>
									<div className="border-t bg-background">
										<PatchDiff patch={diff.patch} />
									</div>
								</CollapsibleContent>
							</Collapsible>
						))}
					</div>
				</div>
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel minSize="20%" defaultSize="50%" className="flex min-h-0 min-w-0">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b md:border-b-0">
					<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
						<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Unstaged</span>
						<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
							{unstagedDiffs.length}
						</span>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{Array.isReadonlyArrayEmpty(unstagedDiffs) ? (
							<div className="px-3 py-6 text-center text-muted-foreground text-xs">No changes</div>
						) : (
							Array.map(unstagedDiffs, diff => (
								<Collapsible key={diff.filePath} className="group border-b">
									<div className="flex items-center gap-2 bg-muted/40 px-3">
										<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left">
											<ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90" />
											<FileIcon filePath={diff.filePath} />
											<span className="min-w-0 truncate font-mono text-xs">
												{pipe(
													diff.filePath,
													String.split('/'),
													Array.matchRight({
														onEmpty: () => <span className="font-semibold text-foreground">{diff.filePath}</span>,
														onNonEmpty: (init, last) => (
															<>
																<span className="text-muted-foreground">{pipe(init, Array.join('/'))}/</span>
																<span className="font-semibold text-foreground">{last}</span>
															</>
														)
													})
												)}
											</span>
										</CollapsibleTrigger>
										<div className="flex shrink-0 items-center gap-1">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-5 w-5 p-0"
												onClick={() => stageFile({payload: {filePath: diff.filePath}})}
												aria-label="Stage file"
												title="Stage"
											>
												<SquarePlus className="size-3.5" />
											</Button>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-5 w-5 p-0 text-destructive hover:text-destructive"
												onClick={() => discardFile({payload: {filePath: diff.filePath}})}
												aria-label="Discard file"
												title="Discard"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</div>
									<CollapsibleContent>
										<div className="border-t bg-background">
											<PatchDiff patch={diff.patch} />
										</div>
									</CollapsibleContent>
								</Collapsible>
							))
						)}
					</div>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}
