/** biome-ignore-all lint/suspicious/noArrayIndexKey: ui list order */

import {Array, Predicate} from 'effect'

import {
	makeToolApprovalResponsePart,
	makeToolResultPart,
	type ToolMessagePart,
	type ToolPart
} from '@ai-toolkit/ai/schema'
import {
	CommandToolInput,
	decodeToolValueOrUndefined,
	makeQuestionToolAnswer,
	makeQuestionToolOutput,
	PathToolInput,
	PatternToolInput,
	QuestionToolInput,
	QuestionToolOutput,
	TextToolOutput,
	WebToolInput
} from '@ai-toolkit/ai/tools'
import {
	ChevronRightIcon,
	FileSearchIcon,
	FileTextIcon,
	GlobeIcon,
	HelpCircleIcon,
	LoaderCircleIcon,
	PenLineIcon,
	SearchIcon,
	TerminalIcon,
	WrenchIcon
} from 'lucide-react'
import {useState} from 'react'

import {Code} from '#components/render/code.tsx'
import {PatchDiff} from '#components/render/diff.tsx'
import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {cn, formatError} from '#lib/utils.ts'

type QuestionItem = QuestionToolInput['questions'][number]
type QuestionResponseState = {selected: string[]; freeform: string}

const TOOL_ICONS: Record<string, typeof TerminalIcon> = {
	bash: TerminalIcon,
	glob: FileSearchIcon,
	grep: SearchIcon,
	patch: PenLineIcon,
	question: HelpCircleIcon,
	read: FileTextIcon,
	web: GlobeIcon,
	write: PenLineIcon
}

/** Tools whose output is expandable when present. */
const EXPANDABLE_KINDS = new Set(['bash', 'write', 'patch'])

export function ToolInteraction(props: {part: ToolPart; onResponse?: (response: ToolMessagePart) => void}) {
	if (isIntentTool(props.part.toolName)) return null

	const isPendingQuestion =
		props.part.toolKind === 'question' &&
		props.part.status !== 'error' &&
		!decodeToolValueOrUndefined(QuestionToolOutput, props.part.output)

	if (isPendingQuestion) return <PendingQuestion part={props.part} onResponse={props.onResponse} />

	return <ToolRow part={props.part} onResponse={props.onResponse} />
}

function ToolRow(props: {part: ToolPart; onResponse?: (response: ToolMessagePart) => void}) {
	const Icon = TOOL_ICONS[props.part.toolKind] ?? WrenchIcon
	const summary = toolSummary(props.part)
	const needsApproval = props.part.status === 'pending-approval'
	const hasError = props.part.status === 'error'
	const hasOutput = Predicate.isNotUndefined(props.part.output)
	const expandable = hasError || (EXPANDABLE_KINDS.has(props.part.toolKind) && hasOutput)
	const isQuestion = props.part.toolKind === 'question'

	if (props.part.toolKind === 'web') {
		return <WebToolRow part={props.part} needsApproval={needsApproval} onResponse={props.onResponse} />
	}

	if (isQuestion && hasOutput && !needsApproval) {
		return (
			<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 py-0.5 text-[12px]">
				<div className="flex items-center gap-1.5 py-0.5">
					<StatusIndicator status={props.part.status} approvalState={props.part.approvalState} isQuestion />
					<Icon className="size-3 shrink-0 text-violet-500/80" />
				</div>
				<div className="min-w-0 py-0.5 text-foreground">{summary}</div>
				<div />
				<div className="min-w-0 border-violet-500/20 border-l pl-2">
					<ToolOutput part={props.part} />
				</div>
			</div>
		)
	}

	if (!expandable || needsApproval) {
		return (
			<div className="flex items-center gap-1.5 py-0.5 text-[12px]">
				<StatusIndicator status={props.part.status} approvalState={props.part.approvalState} isQuestion={isQuestion} />
				<Icon className={cn('size-3 shrink-0', isQuestion ? 'text-violet-500/80' : 'text-muted-foreground')} />
				<span className="min-w-0 truncate text-foreground">{summary}</span>
				{needsApproval && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
		)
	}

	return (
		<Collapsible>
			<CollapsibleTrigger className="group/tool flex w-full items-center gap-1.5 py-0.5 text-[12px] hover:bg-muted/20">
				<ChevronRightIcon className="size-2.5 shrink-0 text-muted-foreground/40 transition-transform group-aria-expanded/tool:rotate-90" />
				<StatusIndicator status={props.part.status} approvalState={props.part.approvalState} isQuestion={isQuestion} />
				<Icon className={cn('size-3 shrink-0', isQuestion ? 'text-violet-500/80' : 'text-muted-foreground')} />
				<span className="min-w-0 truncate text-left text-foreground">{summary}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-3 border-border/40 border-l pl-2">
				<ToolOutput part={props.part} />
			</CollapsibleContent>
		</Collapsible>
	)
}

function WebToolRow(props: {part: ToolPart; needsApproval: boolean; onResponse?: (response: ToolMessagePart) => void}) {
	const input = decodeToolValueOrUndefined(WebToolInput, props.part.input)
	const url = input?.url
	const query = input?.query
	const urlParts = url ? getUrlDisplayParts(url) : undefined

	return (
		<div className="flex items-center gap-1.5 py-0.5 text-[12px]">
			<StatusIndicator status={props.part.status} approvalState={props.part.approvalState} />
			{url ? <Favicon url={url} /> : <GlobeIcon className="size-3 shrink-0 text-muted-foreground" />}
			<div className="min-w-0 truncate text-left">
				{urlParts ? (
					<>
						<span className="text-foreground">{urlParts.hostname}</span>
						{urlParts.suffix && <span className="text-muted-foreground">{urlParts.suffix}</span>}
					</>
				) : (
					<span className="text-foreground">{query ?? props.part.toolName}</span>
				)}
			</div>
			{props.needsApproval && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
		</div>
	)
}

function StatusIndicator(props: {
	status: ToolPart['status']
	approvalState?: ToolPart['approvalState']
	isQuestion?: boolean
}) {
	if (props.isQuestion) {
		if (props.status === 'running')
			return <span className="inline-block size-1.5 shrink-0 animate-pulse bg-violet-500/70" />
		if (props.status === 'success') return <span className="inline-block size-1.5 shrink-0 bg-violet-500" />
		if (props.status === 'pending-approval')
			return <span className="inline-block size-1.5 shrink-0 animate-pulse bg-violet-500" />
		if (props.status === 'denied') return <span className="inline-block size-1.5 shrink-0 bg-violet-500/40" />
	}

	if (props.status === 'running') {
		if (props.approvalState === 'approved') return <span className="inline-block size-1.5 shrink-0 bg-emerald-500/60" />
		return <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground/40" />
	}

	if (props.status === 'success') return <span className="inline-block size-1.5 shrink-0 bg-emerald-500" />
	if (props.status === 'error') return <span className="inline-block size-1.5 shrink-0 bg-destructive" />
	if (props.status === 'pending-approval')
		return <span className="inline-block size-1.5 shrink-0 animate-pulse bg-amber-500" />
	if (props.status === 'denied') return <span className="inline-block size-1.5 shrink-0 bg-destructive/50" />
	return <span className="inline-block size-1.5 shrink-0 bg-muted-foreground/20" />
}

function ToolOutput(props: {part: ToolPart}) {
	if (props.part.status === 'error') {
		return (
			<pre className="overflow-x-auto py-1 font-mono text-[10px] text-destructive leading-snug">
				{formatError(props.part.error)}
			</pre>
		)
	}

	if (props.part.toolKind === 'question') {
		const output = decodeToolValueOrUndefined(QuestionToolOutput, props.part.output)
		if (output) {
			return (
				<div className="space-y-2 py-1 text-[11px]">
					{output.answers.map((answer, index) => (
						<div key={index} className="space-y-0.5">
							{output.answers.length > 1 && <div className="text-muted-foreground">Answer {index + 1}</div>}
							<div className="text-foreground">{formatQuestionAnswer(answer.answer)}</div>
						</div>
					))}
				</div>
			)
		}
	}

	if (props.part.toolKind === 'patch') {
		return <PatchOutput part={props.part} />
	}

	const text = decodeTextOutput(props.part.output)
	if (!text) return null

	const lang =
		props.part.toolKind === 'write'
			? extensionOf(decodeToolValueOrUndefined(PathToolInput, props.part.input)?.path)
			: 'bash'

	return (
		<div className="max-h-60 overflow-auto">
			<Code code={text} lang={lang} />
		</div>
	)
}

function PatchOutput(props: {part: ToolPart}) {
	const path = decodeToolValueOrUndefined(PathToolInput, props.part.input)?.path ?? 'file'
	const text = decodeTextOutput(props.part.output)
	if (!text) return null

	// Try to split old/new from structured output, fall back to showing as diff code
	const output = props.part.output as Record<string, unknown> | undefined
	const oldContent = typeof output?.['old'] === 'string' ? output['old'] : undefined
	const newContent = typeof output?.['new'] === 'string' ? output['new'] : undefined

	if (oldContent !== undefined && newContent !== undefined) {
		return (
			<div className="max-h-60 overflow-auto">
				<PatchDiff filePath={path} old={oldContent} new={newContent} />
			</div>
		)
	}

	return (
		<div className="max-h-60 overflow-auto">
			<Code code={text} lang="diff" />
		</div>
	)
}

function ApprovalActions(props: {part: ToolPart; onResponse?: (response: ToolMessagePart) => void}) {
	const [responded, setResponded] = useState<boolean>()

	function respond(approved: boolean) {
		setResponded(approved)
		if (!props.part.approvalId) return
		props.onResponse?.(makeToolApprovalResponsePart({approvalId: props.part.approvalId, approved}))
	}

	if (Predicate.isBoolean(responded)) {
		return (
			<span className={cn('ml-auto text-[10px]', responded ? 'text-emerald-500/60' : 'text-destructive/60')}>
				{responded ? 'approved' : 'denied'}
			</span>
		)
	}

	return (
		<div className="ml-auto flex items-center gap-1">
			<Button size="xs" variant="outline" className="h-6 w-14 leading-none" onClick={() => respond(true)}>
				Allow
			</Button>
			<Button size="xs" variant="destructive" className="h-6 w-14 leading-none" onClick={() => respond(false)}>
				Deny
			</Button>
		</div>
	)
}

function PendingQuestion(props: {part: ToolPart; onResponse?: (response: ToolMessagePart) => void}) {
	const input = decodeToolValueOrUndefined(QuestionToolInput, props.part.input)
	const questions = input?.questions ?? []
	const [responses, setResponsesEntry, setSingleResponse, setFreeformResponse] = useQuestionState(questions)

	if (Array.isReadonlyArrayEmpty(questions)) return null

	return (
		<div className="border border-violet-500/30 bg-violet-500/5">
			<div className="flex items-center gap-1.5 px-2 py-1 text-[11px]">
				<span className="inline-block size-1.5 shrink-0 animate-pulse bg-violet-500" />
				<HelpCircleIcon className="size-3 shrink-0 text-violet-500/80" />
				<span className="min-w-0 truncate text-foreground">{questions[0]?.question}</span>
			</div>
			<div className="space-y-2 border-border/30 border-t px-2 py-1.5">
				{questions.map((question, qi) => {
					const hasOptions = question.options && question.options.length > 0

					return (
						<div key={`q-${qi}`} className="space-y-1 border-border/30 border-b pb-1.5 last:border-b-0 last:pb-0">
							{questions.length > 1 && (
								<div className="text-[10px] text-muted-foreground">{question.header ?? question.question}</div>
							)}
							{hasOptions && question.multiple && (
								<div className="space-y-0.5">
									{question.options?.map((option, optionIndex) => {
										const optionId = `${props.part.toolCallId}-${qi}-${optionIndex}`

										return (
											<label
												key={option.label}
												htmlFor={optionId}
												className="flex w-full cursor-pointer items-start gap-1.5 px-1 py-0.5 text-[11px] hover:bg-muted/20"
											>
												<Checkbox
													id={optionId}
													aria-label={option.label}
													checked={responses[qi]?.selected.includes(option.label) ?? false}
													onCheckedChange={checked => setResponsesEntry(qi, option.label, Boolean(checked))}
												/>
												<span className="text-foreground">{option.label}</span>
												{option.description && <span className="text-muted-foreground/60">{option.description}</span>}
											</label>
										)
									})}
								</div>
							)}
							{hasOptions && !question.multiple && (
								<RadioGroup value={responses[qi]?.selected[0]} onValueChange={value => setSingleResponse(qi, value)}>
									{question.options?.map((option, optionIndex) => {
										const optionId = `${props.part.toolCallId}-${qi}-${optionIndex}`

										return (
											<label
												key={option.label}
												htmlFor={optionId}
												className="flex w-full cursor-pointer items-start gap-1.5 px-1 py-0.5 text-[11px] hover:bg-muted/20"
											>
												<RadioGroupItem id={optionId} value={option.label} aria-label={option.label} />
												<span className="text-foreground">{option.label}</span>
												{option.description && <span className="text-muted-foreground/60">{option.description}</span>}
											</label>
										)
									})}
								</RadioGroup>
							)}
							{(!hasOptions || question.allowFreeform !== false) && (
								<Input
									className="h-6 text-[11px]"
									value={responses[qi]?.freeform ?? ''}
									onChange={event => setFreeformResponse(qi, event.currentTarget.value)}
									placeholder={hasOptions ? 'Add another option' : 'Type your answer'}
								/>
							)}
						</div>
					)
				})}
				<div className="flex justify-end">
					<Button
						size="xs"
						variant="outline"
						className="h-5 px-2 text-[10px]"
						onClick={() => submitQuestion(props.part, questions, responses, props.onResponse)}
					>
						Submit
					</Button>
				</div>
			</div>
		</div>
	)
}

function useQuestionState(questions: readonly {multiple?: boolean}[]) {
	const [responses, setResponses] = useState<QuestionResponseState[]>(() =>
		questions.map(() => ({selected: [], freeform: ''}))
	)

	function setResponsesEntry(index: number, label: string, checked: boolean) {
		setResponses(current => {
			const next = [...current]
			const entry = next[index] ?? {selected: [], freeform: ''}
			const currentValues = new Set(entry.selected)
			if (checked) currentValues.add(label)
			else currentValues.delete(label)
			next[index] = {freeform: entry.freeform, selected: Array.fromIterable(currentValues)}
			return next
		})
	}

	function setSingleResponse(index: number, value: string) {
		setResponses(current => {
			const next = [...current]
			const entry = next[index] ?? {selected: [], freeform: ''}
			next[index] = {freeform: entry.freeform, selected: value ? [value] : []}
			return next
		})
	}

	function setFreeformResponse(index: number, value: string) {
		setResponses(current => {
			const next = [...current]
			const entry = next[index] ?? {selected: [], freeform: ''}
			next[index] = {freeform: value, selected: entry.selected}
			return next
		})
	}

	return [responses, setResponsesEntry, setSingleResponse, setFreeformResponse] as const
}

function submitQuestion(
	part: ToolPart,
	questions: readonly QuestionItem[],
	responses: readonly QuestionResponseState[],
	onResponse?: (response: ToolMessagePart) => void
) {
	onResponse?.(
		makeToolResultPart({
			output: makeQuestionToolOutput({
				answers: responses.map((response, index) => {
					const question = questions[index]
					const isMultiple = question?.multiple === true
					const values = response.freeform ? [...response.selected, response.freeform] : response.selected
					const answer =
						isMultiple || (question?.allowFreeform !== false && values.length > 1) ? values : (values[0] ?? '')
					const wasFreeform = question?.options
						? values.some(value => !(question.options?.some(option => option.label === value) ?? false))
						: response.freeform.length > 0 || values.length > 0
					return makeQuestionToolAnswer({answer, wasFreeform})
				})
			}),
			toolCallId: part.toolCallId,
			toolKind: part.toolKind,
			toolName: part.toolName
		})
	)
}

function toolSummary(part: ToolPart) {
	if (part.toolKind === 'bash')
		return decodeToolValueOrUndefined(CommandToolInput, part.input)?.command ?? part.toolName
	if (part.toolKind === 'read' || part.toolKind === 'write' || part.toolKind === 'patch') {
		const path = decodeToolValueOrUndefined(PathToolInput, part.input)?.path
		return path ? toRelativePath(path) : part.toolName
	}
	if (part.toolKind === 'glob' || part.toolKind === 'grep')
		return decodeToolValueOrUndefined(PatternToolInput, part.input)?.pattern ?? part.toolName
	if (part.toolKind === 'question') {
		const questions = decodeToolValueOrUndefined(QuestionToolInput, part.input)?.questions ?? []
		const firstQuestion = questions[0]?.question
		if (!firstQuestion) return part.toolName
		return questions.length > 1 ? `${firstQuestion} (+${questions.length - 1})` : firstQuestion
	}
	if (part.toolKind === 'web') {
		const input = decodeToolValueOrUndefined(WebToolInput, part.input)
		return input?.url ? formatUrl(input.url) : (input?.query ?? part.toolName)
	}
	return part.toolName.replace(/[_-]/g, ' ')
}

function isIntentTool(name: string) {
	const lower = name.toLowerCase()
	return lower === 'intent' || lower === 'assistant.intent' || lower === 'report_intent'
}

function decodeTextOutput(output: unknown) {
	return decodeToolValueOrUndefined(TextToolOutput, output)?.text ?? ''
}

function extensionOf(path: string | undefined) {
	if (!path) return 'text'
	const dot = path.lastIndexOf('.')
	return dot >= 0 ? path.slice(dot + 1) : 'text'
}

function formatUrl(value: string) {
	try {
		const url = new URL(value)
		return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
	} catch {
		return value
	}
}

function getUrlDisplayParts(value: string) {
	try {
		const url = new URL(value)
		return {
			hostname: url.hostname,
			suffix: `${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`
		}
	} catch {
		return {hostname: value, suffix: ''}
	}
}

function formatQuestionAnswer(answer: string | readonly string[]) {
	return typeof answer === 'string' ? answer : answer.join(', ')
}

function Favicon(props: {url: string}) {
	const hostname = getHostname(props.url)
	const iconUrl = hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : undefined

	return iconUrl ? (
		<img src={iconUrl} alt="" className="size-3 shrink-0" />
	) : (
		<GlobeIcon className="size-3 shrink-0 text-muted-foreground/50" />
	)
}

function getHostname(value: string) {
	try {
		return new URL(value).hostname
	} catch {
		return undefined
	}
}

function toRelativePath(path: string) {
	const home = path.indexOf('/home/')
	if (home === -1) return path
	const parts = path.slice(home).split('/')
	return parts.length > 3 ? parts.slice(3).join('/') : path
}
