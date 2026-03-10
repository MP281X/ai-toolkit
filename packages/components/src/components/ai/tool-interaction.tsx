'use client'

import {Array, Match, Predicate, pipe, String} from 'effect'

import {
	type AgentResponse,
	formatToolAnswer,
	QuestionResultEvent,
	type QuestionToolPart,
	ToolApprovalResponse,
	type ToolPart,
	type WebsearchToolPart
} from '@ai-toolkit/ai/schema'
import {Globe, HelpCircle, LoaderCircle, Search} from 'lucide-react'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {cn, formatError} from '#lib/utils.ts'

function StatusDot(props: {state: ToolPart['state']}) {
	return pipe(
		Match.value(props.state),
		Match.when(Match.is('running'), () => <LoaderCircle className="size-3 animate-spin text-muted-foreground" />),
		Match.when(Match.is('pending-input', 'pending-approval'), () => (
			<span className="size-2 animate-pulse rounded-sm bg-violet-500" />
		)),
		Match.when(Match.is('completed'), () => <span className="size-2 rounded-sm bg-emerald-500" />),
		Match.orElse(() => <span className="size-2 rounded-sm bg-red-500" />)
	)
}

function SourceFavicon(props: {hostname: string}) {
	const [error, setError] = useState(false)
	if (error) return <Globe className="size-3 shrink-0 text-muted-foreground" />
	return (
		<img
			src={`https://www.google.com/s2/favicons?domain=${props.hostname}&sz=16`}
			className="size-3 shrink-0"
			alt=""
			onError={() => setError(true)}
		/>
	)
}

function ApprovalActions(props: {part: WebsearchToolPart; onRespond?: (response: AgentResponse) => void}) {
	if (
		props.part.state !== 'pending-approval' ||
		Predicate.isNullish(props.part.approvalId) ||
		Predicate.isUndefined(props.onRespond)
	)
		return null
	const approvalId = props.part.approvalId

	return (
		<div className="flex gap-2 pl-5">
			<Button
				size="xs"
				onClick={() =>
					props.onRespond?.(
						new ToolApprovalResponse({
							messageId: props.part.messageId,
							toolCallId: props.part.toolCallId,
							approvalId,
							decision: 'approve'
						})
					)
				}
			>
				Allow
			</Button>
			<Button
				variant="destructive"
				size="xs"
				onClick={() =>
					props.onRespond?.(
						new ToolApprovalResponse({
							messageId: props.part.messageId,
							toolCallId: props.part.toolCallId,
							approvalId,
							decision: 'deny'
						})
					)
				}
			>
				Deny
			</Button>
		</div>
	)
}

function QuestionRenderer(props: {part: QuestionToolPart; onRespond?: (response: AgentResponse) => void}) {
	const [custom, setCustom] = useState<Record<number, string>>({})
	const [answers, setAnswers] = useState<Record<number, readonly string[]>>({})
	const answerAt = (index: number) => {
		const picks = answers[index] ?? []
		const extra = custom[index]
		if (Predicate.isNotNullish(extra) && String.isNonEmpty(String.trim(extra))) {
			return [...picks, String.trim(extra)]
		}
		return picks
	}

	const firstQuestion = props.part.input.questions[0]?.question

	if (props.part.state === 'completed' && Predicate.isNotNullish(props.part.output)) {
		const output = props.part.output
		return (
			<div className="space-y-1.5 text-xs">
				<div className="flex items-center gap-1.5">
					<StatusDot state={props.part.state} />
					<HelpCircle className="size-3 shrink-0 text-muted-foreground" />
					<span className="truncate font-medium">{firstQuestion}</span>
				</div>
				<div className="space-y-1 pl-5">
					{props.part.input.questions.map((entry, index) => (
						<div key={`${props.part.toolCallId}-${entry.question}`} className="space-y-0.5">
							<div className="font-medium">{entry.question}</div>
							<div className="text-muted-foreground">{formatToolAnswer(output.answers[index] ?? [])}</div>
						</div>
					))}
				</div>
			</div>
		)
	}

	if (props.part.state !== 'pending-input' || Predicate.isUndefined(props.onRespond)) {
		return (
			<div className="flex items-center gap-1.5 text-xs">
				<StatusDot state={props.part.state} />
				<HelpCircle className="size-3 shrink-0 text-muted-foreground" />
				<span className="truncate font-medium">{firstQuestion}</span>
			</div>
		)
	}

	return (
		<div className="space-y-2 text-xs">
			<div className="flex items-center gap-1.5">
				<StatusDot state={props.part.state} />
				<HelpCircle className="size-3 shrink-0 text-muted-foreground" />
				<span className="truncate font-medium">{firstQuestion}</span>
			</div>
			<form
				className="space-y-3 pl-5"
				onSubmit={event => {
					event.preventDefault()
					const next = QuestionResultEvent.fields.output.makeUnsafe({
						answers: [answerAt(0), ...props.part.input.questions.slice(1).map((_, index) => answerAt(index + 1))]
					})
					props.onRespond?.(
						new QuestionResultEvent({
							messageId: props.part.messageId,
							toolCallId: props.part.toolCallId,
							output: next
						})
					)
				}}
			>
				{props.part.input.questions.map((entry, index) => (
					<div key={`${props.part.toolCallId}-${entry.question}`} className="space-y-2 border border-border p-2">
						{Predicate.isNotNullish(entry.header) && (
							<div className="text-muted-foreground text-xs">{entry.header}</div>
						)}
						<div className="font-medium text-xs">{entry.question}</div>
						{entry.multiple ? (
							<div className="space-y-2">
								{entry.options.map(option => {
									const checked = (answers[index] ?? []).includes(option.label)
									const id = `${props.part.toolCallId}-${index}-${option.label}`
									return (
										<label key={option.label} className="flex items-start gap-2 text-xs" htmlFor={id}>
											<Checkbox
												id={id}
												checked={checked}
												onCheckedChange={value =>
													setAnswers(state => {
														const list = state[index] ?? []
														const next = value
															? [...list, option.label]
															: Array.filter(list, item => item !== option.label)
														return {...state, [index]: next}
													})
												}
											/>
											<span>{option.label}</span>
										</label>
									)
								})}
							</div>
						) : (
							<RadioGroup
								value={(answers[index] ?? [])[0]}
								onValueChange={value => setAnswers(state => ({...state, [index]: [value]}))}
							>
								{entry.options.map(option => {
									const id = `${props.part.toolCallId}-${index}-${option.label}`
									return (
										<label key={option.label} className="flex items-start gap-2 text-xs" htmlFor={id}>
											<RadioGroupItem id={id} value={option.label} />
											<span>{option.label}</span>
										</label>
									)
								})}
							</RadioGroup>
						)}
						{entry.custom && (
							<Input
								placeholder="Custom answer"
								value={custom[index] ?? ''}
								onChange={event => setCustom(state => ({...state, [index]: event.currentTarget.value}))}
							/>
						)}
					</div>
				))}
				<Button size="xs" type="submit">
					Send answers
				</Button>
			</form>
		</div>
	)
}

function WebsearchRenderer(props: {part: WebsearchToolPart; onRespond?: (response: AgentResponse) => void}) {
	return (
		<div className="space-y-1.5 text-xs">
			<div className="flex items-center gap-1.5">
				<StatusDot state={props.part.state} />
				<Search className="size-3 shrink-0 text-muted-foreground" />
				<span className="truncate font-medium">{props.part.input.query}</span>
			</div>
			<ApprovalActions part={props.part} onRespond={props.onRespond} />
			{Predicate.isNotNullish(props.part.output) && (
				<div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
					{props.part.output.sources.map(source => {
						let hostname = source.url
						try {
							hostname = new URL(source.url).hostname
						} catch {}
						const domain = hostname.replace(/^www\./, '')
						return (
							<a
								key={source.url}
								className={cn('flex items-center gap-1 text-muted-foreground hover:text-foreground')}
								href={source.url}
								rel="noreferrer"
								target="_blank"
							>
								<SourceFavicon hostname={hostname} />
								<span>{domain}</span>
							</a>
						)
					})}
				</div>
			)}
			{props.part.state === 'error' && Predicate.isNotNullish(props.part.error) && (
				<div className="pl-5 text-destructive">{formatError(props.part.error)}</div>
			)}
		</div>
	)
}

export function ToolInteraction(props: {part: ToolPart; onRespond?: (response: AgentResponse) => void}) {
	return (
		<div className="border border-border p-2">
			{pipe(
				Match.value(props.part),
				Match.tag('question', part => <QuestionRenderer part={part} onRespond={props.onRespond} />),
				Match.tag('websearch', part => <WebsearchRenderer part={part} onRespond={props.onRespond} />),
				Match.exhaustive
			)}
		</div>
	)
}
