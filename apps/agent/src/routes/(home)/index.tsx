import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, pipe, Schema, Stream, String} from 'effect'

import {
	ChevronRight,
	FolderGit2,
	GitBranch,
	GitCommitHorizontal,
	Plus,
	Trash2,
	Waypoints
} from '@ai-toolkit/components/icons'
import {TreeExplorer, TreeExplorerItem, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {cn} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {ProjectEntry} from '#rpcs/contracts.ts'
import {ProjectsSnapshot} from '#rpcs/contracts.ts'

const SearchSchema = Schema.Struct({
	projectRoot: Schema.optional(Schema.String),
	worktreeRoot: Schema.optional(Schema.String)
})

type Worktree = ProjectEntry['worktrees'][number]

const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('projects.watch', void 0)),
			Stream.unwrap
		),
		{initialValue: new ProjectsSnapshot({projects: [], scanRoot: ''})}
	)
)

export const Route = createFileRoute('/(home)/')({
	validateSearch: Schema.toStandardSchemaV1(SearchSchema),
	component: RouteComponent
})

function pathLabel(value: string) {
	const segments = pipe(value, String.split('/'))

	for (let index = segments.length - 1; index >= 0; index--) {
		const segment = segments[index]

		if (segment && segment !== '.') {
			return segment
		}
	}

	return value
}

function findProject(projects: ProjectsSnapshot['projects'], projectRoot: string | undefined) {
	for (const project of projects) {
		if (project['repository']['root'] === projectRoot) {
			return project
		}
	}

	return projects[0]
}

function findWorktree(project: ProjectEntry | undefined, worktreeRoot: string | undefined) {
	if (!project) {
		return
	}

	for (const worktree of project['worktrees']) {
		if (worktree['root'] === worktreeRoot) {
			return worktree
		}
	}

	return project['worktrees'][0]
}

function isMainWorktree(project: ProjectEntry, worktree: Worktree) {
	return worktree['root'] === project['repository']['root']
}

function worktreeTitle(project: ProjectEntry, worktree: Worktree) {
	if (isMainWorktree(project, worktree)) {
		return 'main'
	}

	return worktree['branch'] ?? pathLabel(worktree['root'])
}

function shortCommit(value: string) {
	return pipe(value, String.slice(0, 8))
}

function nextWorktreeDirectory(project: ProjectEntry, branch: string) {
	return `${project['repository']['root']}-worktree-${pipe(branch, String.replaceAll('/', '-'))}`
}

function Panel(input: {className?: string; children: React.ReactNode}) {
	return <section className={cn('flex flex-col border', input.className)}>{input.children}</section>
}

function DataRow(input: {label: string; value: string}) {
	return (
		<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t px-3 py-2 font-mono text-xs first:border-t-0">
			<div className="text-muted-foreground uppercase">{input.label}</div>
			<div className="min-w-0 break-all text-foreground">{input.value}</div>
		</div>
	)
}

function RouteComponent() {
	const {value: snapshot} = useAtomSuspense(projectsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'))
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'))
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const projects = snapshot['projects']
	const activeProject = findProject(projects, search.projectRoot)
	const activeWorktree = findWorktree(activeProject, search.worktreeRoot)

	function selectProject(project: ProjectEntry) {
		startTransition(() => {
			navigate({
				search: current => ({
					...current,
					projectRoot: project['repository']['root'],
					worktreeRoot: project['repository']['root']
				})
			})
		})
	}

	function selectWorktree(project: ProjectEntry, worktree: Worktree) {
		startTransition(() => {
			navigate({
				search: current => ({
					...current,
					projectRoot: project['repository']['root'],
					worktreeRoot: worktree['root']
				})
			})
		})
	}

	function createProjectWorktree(project: ProjectEntry) {
		const branch = window.prompt('Branch name')
		if (!branch) {
			return
		}

		createWorktree({
			payload: {
				baseBranch: project['worktrees'][0]?.['branch'] ?? 'main',
				branch,
				cwd: project['repository']['root'],
				directory: nextWorktreeDirectory(project, branch)
			}
		})
	}

	function removeWorktree(worktree: Worktree) {
		if (!window.confirm(`Delete worktree ${worktree['root']}?`)) {
			return
		}

		deleteWorktree({payload: {cwd: worktree['root'], force: true}})
	}

	return (
		<div className="min-h-0 flex-1 overflow-hidden bg-background font-mono">
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="28%" minSize="20%" maxSize="40%">
					<div className="flex h-full flex-col border-r">
						<div className="border-b px-3 py-2">
							<div className="text-[11px] text-muted-foreground uppercase">Projects</div>
						</div>

						<TreeExplorer className="overflow-y-auto px-0 py-2">
							<TreeExplorerSection label="Projects">
								{Array.isReadonlyArrayEmpty(projects) ? (
									<li className="px-2 py-6 text-center text-muted-foreground text-xs">No projects found.</li>
								) : (
									Array.map(projects, project => (
										<li key={project['repository']['gitDirectory']} className="flex min-w-0 flex-col gap-1">
											<Collapsible
												defaultOpen={
													activeProject?.['repository']['gitDirectory'] === project['repository']['gitDirectory']
												}
											>
												<CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground">
													<ChevronRight className="size-3 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
													<button
														type="button"
														onClick={event => {
															event.stopPropagation()
															selectProject(project)
														}}
														className={cn(
															'flex min-w-0 flex-1 items-center gap-1.5 text-left',
															activeProject?.['repository']['gitDirectory'] === project['repository']['gitDirectory'] &&
																'text-foreground'
														)}
													>
														<FolderGit2 className="size-3.5 shrink-0" />
														<span className="min-w-0 truncate">{pathLabel(project['repository']['root'])}</span>
													</button>
												</CollapsibleTrigger>

												<CollapsibleContent>
													<div className="ml-4 flex flex-col border-l pl-1">
														{Array.map(project['worktrees'], worktree => (
															<TreeExplorerItem
																key={worktree['root']}
																selected={activeWorktree?.['root'] === worktree['root']}
																onClick={() => selectWorktree(project, worktree)}
																icon={<div className="size-3.5" />}
															>
																{worktreeTitle(project, worktree)}
															</TreeExplorerItem>
														))}
													</div>
												</CollapsibleContent>
											</Collapsible>
										</li>
									))
								)}
							</TreeExplorerSection>
						</TreeExplorer>
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="72%" minSize="40%">
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex items-center gap-3 border-b px-4 py-3">
							<div className="min-w-0 flex-1">
								<div className="text-[11px] text-muted-foreground uppercase">Active worktree</div>
								<div className="truncate text-foreground text-sm">
									{activeProject ? pathLabel(activeProject['repository']['root']) : 'No project selected'}
									{activeProject && activeWorktree ? ` / ${worktreeTitle(activeProject, activeWorktree)}` : ''}
								</div>
							</div>
							<div className="flex items-center gap-2">
								{activeProject && (
									<Button
										type="button"
										variant="outline"
										size="xs"
										onClick={() => createProjectWorktree(activeProject)}
									>
										<Plus className="size-3.5" />
										Create worktree
									</Button>
								)}
								{activeProject && activeWorktree && !isMainWorktree(activeProject, activeWorktree) && (
									<Button type="button" variant="outline" size="xs" onClick={() => removeWorktree(activeWorktree)}>
										<Trash2 className="size-3.5" />
										Delete worktree
									</Button>
								)}
							</div>
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto p-4">
							{!(activeProject && activeWorktree) ? (
								<div className="flex h-full items-center justify-center border text-muted-foreground text-sm">
									No project selected.
								</div>
							) : (
								<div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.75fr)]">
									<div className="flex min-w-0 flex-col gap-4">
										<Panel>
											<div className="flex items-center gap-2 border-b px-3 py-2 text-muted-foreground text-xs uppercase">
												<FolderGit2 className="size-3.5" />
												Project
											</div>
											<DataRow label="name" value={pathLabel(activeProject['repository']['root'])} />
											<DataRow label="root" value={activeProject['repository']['root']} />
											<DataRow label="git dir" value={activeProject['repository']['gitDirectory']} />
											<DataRow label="worktrees" value={`${activeProject['worktrees'].length}`} />
										</Panel>

										<Panel>
											<div className="flex items-center gap-2 border-b px-3 py-2 text-muted-foreground text-xs uppercase">
												<Waypoints className="size-3.5" />
												Worktree
											</div>
											<DataRow
												label="kind"
												value={isMainWorktree(activeProject, activeWorktree) ? 'main repo worktree' : 'linked worktree'}
											/>
											<DataRow label="branch" value={activeWorktree['branch'] ?? 'detached'} />
											<DataRow label="commit" value={shortCommit(activeWorktree['commit'])} />
											<DataRow label="root" value={activeWorktree['root']} />
										</Panel>
									</div>

									<div className="flex min-w-0 flex-col gap-4">
										<Panel>
											<div className="flex items-center gap-2 border-b px-3 py-2 text-muted-foreground text-xs uppercase">
												<GitBranch className="size-3.5" />
												All worktrees
											</div>
											<div className="flex flex-col">
												{Array.map(activeProject['worktrees'], worktree => (
													<button
														key={worktree['root']}
														type="button"
														onClick={() => selectWorktree(activeProject, worktree)}
														className={cn(
															'grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t px-3 py-2 text-left text-xs first:border-t-0 hover:bg-muted',
															activeWorktree['root'] === worktree['root'] && 'bg-primary/8'
														)}
													>
														<div className="min-w-0">
															<div className="truncate text-foreground">{worktreeTitle(activeProject, worktree)}</div>
															<div className="truncate text-[11px] text-muted-foreground">{worktree['root']}</div>
														</div>
														<div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
															<span>{worktree['branch'] ?? 'detached'}</span>
															<span>{shortCommit(worktree['commit'])}</span>
														</div>
													</button>
												))}
											</div>
										</Panel>

										<Panel>
											<div className="flex items-center gap-2 border-b px-3 py-2 text-muted-foreground text-xs uppercase">
												<GitCommitHorizontal className="size-3.5" />
												Focus
											</div>
											<div className="flex flex-col gap-2 px-3 py-3 text-muted-foreground text-xs leading-6">
												<div>Projects are repos.</div>
												<div>Worktrees are the working unit.</div>
												<div>Agent panels are removed until the project/worktree shell is in place.</div>
											</div>
										</Panel>
									</div>
								</div>
							)}
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}
