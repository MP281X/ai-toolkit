import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {DateTime, Predicate, Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import type {Prompt} from 'effect/unstable/ai'
import {startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {conversationAtom, inspectorAtom, issuesAtom, planningAtom, repositoriesAtom, usageAtom} from '#lib/state.ts'
import {AgentId, BranchName} from '#services/issues/schema.ts'
import {RepositoryName} from '#services/repositories/schema.ts'
import type {ActiveIssue, PlanningConversation} from '#services/workbench/schema.ts'
import {Archive, GitBranch, Menu, MessageSquarePlus, PanelRight, Play, Plus, Send} from '@deslop/components/icons'
import {Badge} from '@deslop/components/ui/badge'
import {Button} from '@deslop/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@deslop/components/ui/dialog'
import {Input} from '@deslop/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@deslop/components/ui/select'
import {Textarea} from '@deslop/components/ui/textarea'

type ActiveIssueValue = typeof ActiveIssue.Type
type PlanningConversationValue = typeof PlanningConversation.Type

const Search = Schema.Struct({
	conversation: Schema.optional(Schema.String),
	inspector: Schema.optional(Schema.Boolean),
	issue: Schema.optional(Schema.String),
	mode: Schema.optional(Schema.Literals(['implementation', 'planning'] as const)),
	repository: Schema.optional(Schema.String)
})

export const Route = createFileRoute('/(home)/')({
	component: WorkbenchPage,
	validateSearch: Schema.toStandardSchemaV1(Search)
})

function statusTone(status: string) {
	if (status === 'Needs update' || status === 'Running' || status === 'Implemented') {
		return 'border-primary bg-muted text-primary'
	}
	return 'border-border bg-muted/40 text-muted-foreground'
}

function Sidebar(input: {
	readonly activeIssue?: string
	readonly activePlanning?: string
	readonly issues: readonly ActiveIssueValue[]
	readonly mobileOpen: boolean
	readonly planning: readonly PlanningConversationValue[]
	readonly repository: string
	readonly selectIssue: (branch: string) => void
	readonly selectPlanning: (agentId: string) => void
}) {
	const create = useAtomSet(RpcClient.mutation('planning.create'), {mode: 'promise'})
	const navigate = Route.useNavigate()
	const [creating, setCreating] = useState(false)
	const [createError, setCreateError] = useState<string>()
	return (
		<aside className={`workbench-sidebar ${input.mobileOpen ? 'is-open' : ''}`} id="workbench-navigation">
			<div className="sidebar-heading">
				<span>Planning</span>
				<Button
					aria-label="New planning conversation"
					disabled={input.repository === '' || creating}
					size="icon-xs"
					variant="ghost"
					onClick={() => {
						setCreating(true)
						setCreateError(undefined)
						void create({payload: {repository: RepositoryName.make(input.repository)}})
							.then(value => {
								startTransition(() => {
									void navigate({
										search: previous => ({...previous, conversation: value.agentId, issue: undefined, mode: 'planning'})
									})
								})
							})
							.catch(() => {
								setCreateError('Could not create a planning conversation.')
							})
							.finally(() => {
								setCreating(false)
							})
					}}
				>
					<MessageSquarePlus />
				</Button>
			</div>
			{Predicate.isNotUndefined(createError) && <p className="destructive-error sidebar-error">{createError}</p>}
			<nav className="issue-list" aria-label="Planning conversations">
				{input.planning
					.filter(item => item.repository === input.repository)
					.map(item => (
						<button
							className={input.activePlanning === item.agentId ? 'issue-row is-active' : 'issue-row'}
							key={item.agentId}
							type="button"
							onClick={() => {
								input.selectPlanning(item.agentId)
							}}
						>
							<span className="issue-title">{item.title}</span>
							<span className="issue-meta">{item.agentId.slice(0, 8)}</span>
						</button>
					))}
			</nav>
			<div className="sidebar-heading issues-heading">
				<span>Issues</span>
				<span className="count">{input.issues.length}</span>
			</div>
			<nav className="issue-list" aria-label="Saved issues">
				{input.issues.map(issue => (
					<button
						className={input.activeIssue === issue.branch ? 'issue-row is-active' : 'issue-row'}
						key={issue.branch}
						type="button"
						onClick={() => {
							input.selectIssue(issue.branch)
						}}
					>
						<span className="issue-title">{issue.branch}</span>
						<span className="issue-meta">
							<GitBranch />
							{issue.branch}
						</span>
						<Badge className={statusTone(issue.lifecycle)} variant="outline">
							{issue.lifecycle}
						</Badge>
					</button>
				))}
			</nav>
		</aside>
	)
}

function messageText(message: Prompt.Message) {
	if (message.role === 'system') return message.content
	return message.content
		.flatMap(part => {
			if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') return [part.text]
			if (part.type === 'tool-call') return [`Tool: ${part.name}`]
			if (part.type === 'tool-result') {
				return [`${part.name}: ${typeof part.result === 'string' ? part.result : 'Completed'}`]
			}
			return []
		})
		.join('\n')
}

function ConversationPanel(input: {readonly agentId: string; readonly branch?: string; readonly repository: string}) {
	const key = `${input.repository}\u0000${input.agentId}\u0000${input.branch ?? ''}`
	const conversation = useAtomSuspense(conversationAtom(key))
	const [prompt, setPrompt] = useState('')
	const [sending, setSending] = useState(false)
	const [sendError, setSendError] = useState<string>()
	const planningPrompt = useAtomSet(RpcClient.mutation('planning.prompt'), {mode: 'promise'})
	const implementationPrompt = useAtomSet(RpcClient.mutation('implementation.prompt'), {mode: 'promise'})
	function submit() {
		const body = prompt.trim()
		if (body === '' || sending) return
		setSending(true)
		setSendError(undefined)
		void (
			Predicate.isUndefined(input.branch)
				? planningPrompt({
						payload: {
							agentId: AgentId.make(input.agentId),
							prompt: body,
							repository: RepositoryName.make(input.repository)
						}
					})
				: implementationPrompt({
						payload: {
							branch: BranchName.make(input.branch),
							prompt: body,
							repository: RepositoryName.make(input.repository)
						}
					})
		)
			.then(() => {
				setPrompt('')
			})
			.catch(() => {
				setSendError('The message was not accepted. Your draft was retained.')
			})
			.finally(() => {
				setSending(false)
			})
	}
	return (
		<section className="conversation-panel">
			<div className="conversation-scroll">
				{conversation.value.history.map((message, index) => (
					<article className={`message message-${message.role}`} key={`${message.role}-${index}`}>
						<span className="message-role">{message.role}</span>
						<pre>{messageText(message)}</pre>
					</article>
				))}
				{conversation.value.history.length === 0 && (
					<div className="empty-state">
						Describe the outcome. The agent can inspect the repository and build the plan.
					</div>
				)}
			</div>
			<div className="composer">
				{Predicate.isNotUndefined(sendError) && <p className="destructive-error">{sendError}</p>}
				<Textarea
					aria-label="Message"
					placeholder="Message the agent…"
					value={prompt}
					onChange={event => {
						setPrompt(event.target.value)
					}}
					onKeyDown={event => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							submit()
						}
					}}
				/>
				<Button aria-label="Send message" disabled={sending} size="icon" onClick={submit}>
					<Send />
				</Button>
			</div>
		</section>
	)
}

function Inspector(input: {readonly branch: string; readonly repository: string}) {
	const inspector = useAtomSuspense(inspectorAtom(`${input.repository}\u0000${input.branch}`))
	return (
		<div className="inspector-content">
			<section>
				<h3>Issue</h3>
				<div className="inspector-row">
					<GitBranch />
					<span>{inspector.value.branch}</span>
				</div>
				{Predicate.isNotUndefined(inspector.value.worktree) && <p>{inspector.value.worktree}</p>}
				{Predicate.isNotUndefined(inspector.value.pullRequest) && (
					<a href={inspector.value.pullRequest.url.toString()} rel="noreferrer" target="_blank">
						PR #{inspector.value.pullRequest.number} · {inspector.value.pullRequest.state}
					</a>
				)}
			</section>
			<section>
				<h3>Changes</h3>
				{inspector.value.changes.map(change => (
					<div className="inspector-row" key={change.path}>
						<Badge variant="outline">{change.status}</Badge>
						<span>{change.path}</span>
					</div>
				))}
				{inspector.value.changes.length === 0 && <p>No implementation changes.</p>}
			</section>
			<section>
				<h3>Processes</h3>
				{inspector.value.processes.map(process => (
					<div className="inspector-row" key={process.script}>
						<span className={`process-dot process-${process.status}`} />
						<span>{process.script}</span>
					</div>
				))}
			</section>
			<section>
				<h3>Sources</h3>
				{inspector.value.sources.map(source => (
					<div key={source.name}>{source.name}</div>
				))}
			</section>
			<section>
				<h3>Active subagents</h3>
				{inspector.value.activeSubagents.map(subagent => (
					<div className="inspector-row" key={subagent.agentId}>
						<span>{subagent.skill ?? 'general'}</span>
						<span>{subagent.task}</span>
					</div>
				))}
				{inspector.value.activeSubagents.length === 0 && <p>No active subagents.</p>}
			</section>
		</div>
	)
}

function IssueView(input: {
	readonly issue: ActiveIssueValue
	readonly mode: 'implementation' | 'planning'
	readonly repository: string
}) {
	const navigate = Route.useNavigate()
	const start = useAtomSet(RpcClient.mutation('implementation.start'), {mode: 'promise'})
	const close = useAtomSet(RpcClient.mutation('issues.close'), {mode: 'promise'})
	const publish = useAtomSet(RpcClient.mutation('publication.publish'), {mode: 'promise'})
	const save = useAtomSet(RpcClient.mutation('issues.savePlan'), {mode: 'promise'})
	const [editedPlan, setEditedPlan] = useState<string>()
	const [closeOpen, setCloseOpen] = useState(false)
	const [closing, setClosing] = useState(false)
	const [closeError, setCloseError] = useState<string>()
	const [action, setAction] = useState<'publish' | 'save' | 'start'>()
	const [actionError, setActionError] = useState<string>()
	const plan = editedPlan ?? input.issue.plan
	const hasImplementation = Predicate.isNotUndefined(input.issue.implementationAgentId)
	let implementationAction = input.issue.lifecycle === 'Needs update' ? 'Deliver update' : 'Implement'
	if (action === 'start') implementationAction = 'Starting…'
	return (
		<>
			<header className="content-header">
				<div>
					<span className="eyebrow">{input.issue.lifecycle}</span>
					<h1>{input.issue.branch}</h1>
				</div>
				<div className="header-actions">
					{hasImplementation && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								void navigate({
									search: previous => ({...previous, mode: input.mode === 'planning' ? 'implementation' : 'planning'})
								})
							}}
						>
							{input.mode === 'planning' ? 'Implementation' : 'Planning'}
						</Button>
					)}
					<Button
						disabled={Predicate.isNotUndefined(action)}
						size="sm"
						variant="outline"
						onClick={() => {
							setAction('start')
							setActionError(undefined)
							void start({payload: {branch: input.issue.branch, repository: RepositoryName.make(input.repository)}})
								.catch(() => {
									setActionError('Implementation could not be started.')
								})
								.finally(() => {
									setAction(undefined)
								})
						}}
					>
						<Play />
						{implementationAction}
					</Button>
					<Button
						disabled={Predicate.isNotUndefined(action)}
						size="sm"
						variant="outline"
						onClick={() => {
							setAction('publish')
							setActionError(undefined)
							void publish({payload: {branch: input.issue.branch, repository: RepositoryName.make(input.repository)}})
								.catch(() => {
									setActionError('Publication failed. The issue remains open.')
								})
								.finally(() => {
									setAction(undefined)
								})
						}}
					>
						<GitBranch />
						{action === 'publish' ? 'Publishing…' : 'Publish'}
					</Button>
					<Button
						aria-label="Close issue"
						size="icon-sm"
						variant="ghost"
						onClick={() => {
							setCloseError(undefined)
							setCloseOpen(true)
						}}
					>
						<Archive />
					</Button>
				</div>
			</header>
			{Predicate.isNotUndefined(actionError) && <p className="destructive-error content-error">{actionError}</p>}
			{input.mode === 'planning' || !hasImplementation ? (
				<div className="planning-layout">
					<ConversationPanel agentId={input.issue.planningAgentId} repository={input.repository} />
					<div className="plan-editor">
						<label htmlFor="issue-plan">Accepted plan</label>
						<Textarea
							id="issue-plan"
							value={plan}
							onChange={event => {
								setEditedPlan(event.target.value)
							}}
						/>
						<Button
							disabled={plan.trim() === '' || plan === input.issue.plan || Predicate.isNotUndefined(action)}
							onClick={() => {
								setAction('save')
								setActionError(undefined)
								void save({
									payload: {
										agentId: input.issue.planningAgentId,
										branch: input.issue.branch,
										plan,
										repository: RepositoryName.make(input.repository)
									}
								})
									.then(() => {
										setEditedPlan(undefined)
									})
									.catch(() => {
										setActionError('The plan iteration could not be saved.')
									})
									.finally(() => {
										setAction(undefined)
									})
							}}
						>
							{action === 'save' ? 'Saving…' : 'Save plan iteration'}
						</Button>
					</div>
				</div>
			) : (
				<div className="issue-body">
					<div className="plan-document">
						<pre>{input.issue.plan}</pre>
					</div>
					<ConversationPanel
						agentId={input.issue.implementationAgentId}
						branch={input.issue.branch}
						repository={input.repository}
					/>
				</div>
			)}
			<Dialog open={closeOpen} onOpenChange={setCloseOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Close {input.issue.branch}?</DialogTitle>
					</DialogHeader>
					<p>
						This removes its agent sessions, processes, worktrees, and local branch. Published work is archived and its
						remote pull request and branch are closed.
					</p>
					{Predicate.isNotUndefined(closeError) && <p className="destructive-error">{closeError}</p>}
					<Button
						disabled={closing}
						variant="destructive"
						onClick={() => {
							setClosing(true)
							setCloseError(undefined)
							void close({payload: {branch: input.issue.branch, repository: RepositoryName.make(input.repository)}})
								.then(() => {
									setCloseOpen(false)
									void navigate({search: previous => ({...previous, issue: undefined})})
								})
								.catch((error: unknown) => {
									setCloseError(error instanceof Error ? error.message : 'Issue closure failed.')
								})
								.finally(() => {
									setClosing(false)
								})
						}}
					>
						{closing ? 'Closing…' : 'Close issue'}
					</Button>
				</DialogContent>
			</Dialog>
		</>
	)
}

function WorkbenchPage() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const repositories = useAtomSuspense(repositoriesAtom)
	const usage = useAtomSuspense(usageAtom)
	const repository = search.repository ?? repositories.value[0]?.name ?? ''
	const issues = useAtomSuspense(issuesAtom(repository))
	const planning = useAtomSuspense(planningAtom)
	const activeIssue = issues.value.find(issue => issue.branch === search.issue)
	const activePlanning = planning.value.find(
		item => item.repository === repository && item.agentId === search.conversation
	)
	const addRepository = useAtomSet(RpcClient.mutation('repositories.add'), {mode: 'promise'})
	const save = useAtomSet(RpcClient.mutation('planning.save'), {mode: 'promise'})
	const [repositoryUrl, setRepositoryUrl] = useState('')
	const [plans, setPlans] = useState<Readonly<Record<string, string>>>({})
	const [mobileOpen, setMobileOpen] = useState(false)
	const [addOpen, setAddOpen] = useState(false)
	const [savingPlans, setSavingPlans] = useState<Readonly<Record<string, boolean>>>({})
	const [planErrors, setPlanErrors] = useState<Readonly<Record<string, string>>>({})
	const [addingRepository, setAddingRepository] = useState(false)
	const [repositoryError, setRepositoryError] = useState<string>()
	const planKey = Predicate.isUndefined(activePlanning) ? '' : `${repository}:${activePlanning.agentId}`
	const plan = plans[planKey] ?? ''
	const savingPlan = savingPlans[planKey] === true
	const planError = planErrors[planKey]
	function selectIssue(branch: string) {
		setMobileOpen(false)
		const issue = issues.value.find(current => current.branch === branch)
		startTransition(() => {
			void navigate({
				search: previous => ({
					...previous,
					conversation: undefined,
					issue: branch,
					mode: Predicate.isNotUndefined(issue?.implementationAgentId) ? 'implementation' : 'planning',
					repository
				})
			})
		})
	}
	function selectPlanning(agentId: string) {
		setMobileOpen(false)
		startTransition(() => {
			void navigate({
				search: previous => ({...previous, conversation: agentId, issue: undefined, mode: 'planning', repository})
			})
		})
	}
	let mainContent = (
		<div className="empty-state">
			<GitBranch />
			Select an issue or start a planning conversation.
		</div>
	)
	if (Predicate.isNotUndefined(activePlanning)) {
		mainContent = (
			<>
				<header className="content-header">
					<div>
						<span className="eyebrow">Planning</span>
						<h1>{activePlanning.title}</h1>
					</div>
				</header>
				<div className="planning-layout">
					<ConversationPanel agentId={activePlanning.agentId} repository={repository} />
					<div className="plan-editor">
						<label htmlFor="plan">Accepted plan</label>
						<Textarea
							id="plan"
							placeholder="# Outcome&#10;&#10;Write or paste the complete implementation plan…"
							value={plan}
							onChange={event => {
								const value = event.target.value
								setPlans(current => ({...current, [planKey]: value}))
							}}
						/>
						{Predicate.isNotUndefined(planError) && <p className="destructive-error">{planError}</p>}
						<Button
							disabled={plan.trim() === '' || savingPlan}
							onClick={() => {
								setSavingPlans(current => ({...current, [planKey]: true}))
								setPlanErrors(current => {
									const {[planKey]: _removed, ...remaining} = current
									return remaining
								})
								void save({
									payload: {agentId: activePlanning.agentId, plan, repository: RepositoryName.make(repository)}
								})
									.then(selectIssue)
									.catch(() => {
										setPlanErrors(current => ({
											...current,
											[planKey]: 'The issue could not be saved. Your plan was retained.'
										}))
									})
									.finally(() => {
										setSavingPlans(current => ({...current, [planKey]: false}))
									})
							}}
						>
							{savingPlan ? 'Saving…' : 'Save issue'}
						</Button>
					</div>
				</div>
			</>
		)
	}
	if (Predicate.isNotUndefined(activeIssue)) {
		mainContent = (
			<IssueView
				key={activeIssue.branch}
				issue={activeIssue}
				mode={
					search.mode ?? (Predicate.isNotUndefined(activeIssue.implementationAgentId) ? 'implementation' : 'planning')
				}
				repository={repository}
			/>
		)
	}
	return (
		<div className="workbench-shell">
			<header className="topbar">
				<Button
					aria-controls="workbench-navigation"
					aria-expanded={mobileOpen}
					aria-label="Toggle issue navigation"
					className="mobile-menu"
					size="icon-sm"
					variant="ghost"
					onClick={() => {
						setMobileOpen(value => !value)
					}}
				>
					<Menu />
				</Button>
				<div className="brand">Workbench</div>
				<Select
					value={repository}
					onValueChange={value => {
						if (value !== null) {
							void navigate({
								search: previous => ({...previous, conversation: undefined, issue: undefined, repository: value})
							})
						}
					}}
				>
					<SelectTrigger className="repository-select">
						<SelectValue placeholder="Select repository" />
					</SelectTrigger>
					<SelectContent>
						{repositories.value.map(item => (
							<SelectItem key={item.name} value={item.name}>
								{item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					aria-label="Add repository"
					size="icon-sm"
					variant="ghost"
					onClick={() => {
						setAddOpen(true)
					}}
				>
					<Plus />
				</Button>
				<div className="topbar-spacer" />
				<span className="usage">
					{Math.round(usage.value.weeklyRemaining)}% weekly · resets{' '}
					{DateTime.toDate(usage.value.weeklyResetAt).toLocaleString([], {
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						month: 'short'
					})}
				</span>
				<Button
					aria-controls="workbench-inspector"
					aria-label="Toggle issue inspector"
					aria-pressed={search.inspector === true}
					disabled={Predicate.isUndefined(activeIssue)}
					size="icon-sm"
					variant={search.inspector === true ? 'secondary' : 'ghost'}
					onClick={() => {
						void navigate({search: previous => ({...previous, inspector: previous.inspector !== true})})
					}}
				>
					<PanelRight />
				</Button>
			</header>
			<div className="workbench-grid">
				<Sidebar
					activeIssue={activeIssue?.branch}
					activePlanning={activePlanning?.agentId}
					issues={issues.value}
					mobileOpen={mobileOpen}
					planning={planning.value}
					repository={repository}
					selectIssue={selectIssue}
					selectPlanning={selectPlanning}
				/>
				<main className="workbench-main">{mainContent}</main>
				{search.inspector === true && Predicate.isNotUndefined(activeIssue) && (
					<aside className="workbench-inspector" id="workbench-inspector">
						<Inspector branch={activeIssue.branch} repository={repository} />
					</aside>
				)}
			</div>
			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add GitHub repository</DialogTitle>
					</DialogHeader>
					<Input
						placeholder="https://github.com/owner/repository"
						value={repositoryUrl}
						onChange={event => {
							setRepositoryUrl(event.target.value)
						}}
					/>
					{Predicate.isNotUndefined(repositoryError) && <p className="destructive-error">{repositoryError}</p>}
					<Button
						disabled={addingRepository}
						onClick={() => {
							let url: URL
							try {
								url = new URL(repositoryUrl)
							} catch {
								setRepositoryError('Enter a valid GitHub repository URL.')
								return
							}
							setAddingRepository(true)
							setRepositoryError(undefined)
							void addRepository({payload: {url}})
								.then(value => {
									setAddOpen(false)
									setRepositoryUrl('')
									void navigate({search: {repository: value.name}})
								})
								.catch(() => {
									setRepositoryError('The repository could not be added.')
								})
								.finally(() => {
									setAddingRepository(false)
								})
						}}
					>
						{addingRepository ? 'Adding…' : 'Add repository'}
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	)
}
