/** biome-ignore-all lint/suspicious/noArrayIndexKey: stream-derived UI */

import {Array, Match, Option, Predicate, pipe, Schema, String} from 'effect'

import {type AgentResponse, ToolApprovalResponseEvent, type ToolPart, ToolResultEvent} from '@ai-toolkit/ai/schema'
import {QuestionTool, WebsearchTool} from '@ai-toolkit/ai/tool'
import {ChevronRightIcon, GlobeIcon, HelpCircleIcon, LoaderCircleIcon, ShieldAlertIcon, WrenchIcon} from 'lucide-react'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {formatError} from '#lib/utils.ts'

export function ToolInteraction(props: {part: ToolPart; onResponse?: (response: AgentResponse) => void}) {
	return pipe(
		Match.value(props.part.tool),
		Match.when('question', () => <QuestionToolRow part={props.part} onResponse={props.onResponse} />),
		Match.when('websearch', () => <WebsearchToolRow part={props.part} onResponse={props.onResponse} />),
		Match.orElse(() => <GenericToolRow part={props.part} onResponse={props.onResponse} />)
	)
}

function QuestionToolRow(props: {part: ToolPart; onResponse?: (response: AgentResponse) => void}) {
	const input = Option.getOrUndefined(Schema.decodeUnknownOption(QuestionTool.fields.input)(props.part.input))
	const output = Option.getOrUndefined(Schema.decodeUnknownOption(QuestionTool.fields.output)(props.part.output))
	const [answers, setAnswers] = useState(
		() => input?.questions.map(() => ({freeform: '', selected: [] as string[]})) ?? []
	)

	if (!input) return <GenericToolRow part={props.part} onResponse={props.onResponse} />

	return (
		<div className="border border-violet-500/30 bg-violet-500/5 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<HelpCircleIcon className="size-3 shrink-0 text-violet-500/80" />
				<span className="text-violet-200">question</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
			{input.questions.map((question, questionIndex) => (
				<div key={questionIndex} className="mt-2 text-[11px]">
					{String.isNonEmpty(question.header ?? '') && (
						<div className="mb-1 text-[10px] text-muted-foreground">{question.header}</div>
					)}
					<div className="text-foreground">{question.question}</div>

					{props.part.state === 'pending-input' ? (
						<>
							{Array.isReadonlyArrayNonEmpty(question.options) && question.multiple === true && (
								<div className="mt-1 space-y-1">
									{question.options.map((option, optionIndex) => {
										const id = `${props.part.toolCallId}-${questionIndex}-${optionIndex}`
										return (
											<label key={id} htmlFor={id} className="flex items-start gap-1.5">
												<Checkbox
													id={id}
													checked={answers[questionIndex]?.selected.includes(option.label) ?? false}
													onCheckedChange={checked =>
														setAnswers(current =>
															Array.map(current, (answer, index) =>
																index !== questionIndex
																	? answer
																	: {
																			freeform: answer.freeform,
																			selected: checked
																				? [...answer.selected, option.label]
																				: Array.filter(answer.selected, value => value !== option.label)
																		}
															)
														)
													}
												/>
												<span>{option.label}</span>
											</label>
										)
									})}
								</div>
							)}

							{Array.isReadonlyArrayNonEmpty(question.options) && question.multiple !== true && (
								<RadioGroup
									className="mt-1"
									value={answers[questionIndex]?.selected[0] ?? ''}
									onValueChange={value =>
										setAnswers(current =>
											Array.map(current, (answer, index) =>
												index !== questionIndex ? answer : {freeform: answer.freeform, selected: [value]}
											)
										)
									}
								>
									{question.options.map((option, optionIndex) => {
										const id = `${props.part.toolCallId}-${questionIndex}-${optionIndex}`
										return (
											<label key={id} htmlFor={id} className="flex items-start gap-1.5">
												<RadioGroupItem id={id} value={option.label} />
												<span>{option.label}</span>
											</label>
										)
									})}
								</RadioGroup>
							)}

							{question.custom !== false && (
								<Input
									className="mt-1 h-6 text-[11px]"
									value={answers[questionIndex]?.freeform ?? ''}
									onChange={event => {
										const freeform = event.currentTarget.value
										setAnswers(current =>
											Array.map(current, (answer, index) =>
												index !== questionIndex ? answer : {freeform, selected: answer.selected}
											)
										)
									}}
									placeholder="Type your answer"
								/>
							)}
						</>
					) : (
						output?.answers[questionIndex] && (
							<div className="mt-1 text-[10px] text-muted-foreground">{output.answers[questionIndex]?.join(', ')}</div>
						)
					)}
				</div>
			))}

			{props.part.state === 'pending-input' && (
				<div className="mt-2 flex justify-end">
					<Button
						size="xs"
						variant="outline"
						onClick={() =>
							props.onResponse?.(
								new ToolResultEvent({
									messageId: props.part.messageId,
									toolCallId: props.part.toolCallId,
									tool: 'question',
									output: {
										answers: Array.map(answers, answer =>
											String.isNonEmpty(answer.freeform) ? [...answer.selected, answer.freeform] : answer.selected
										)
									}
								})
							)
						}
					>
						Submit
					</Button>
				</div>
			)}

			{props.part.state === 'error' && (
				<pre className="mt-2 overflow-x-auto font-mono text-[10px] text-destructive leading-snug">
					{formatError(props.part.error)}
				</pre>
			)}
		</div>
	)
}

function WebsearchToolRow(props: {part: ToolPart; onResponse?: (response: AgentResponse) => void}) {
	const input = Option.getOrUndefined(Schema.decodeUnknownOption(WebsearchTool.fields.input)(props.part.input))
	const output = Option.getOrUndefined(Schema.decodeUnknownOption(WebsearchTool.fields.output)(props.part.output))

	if (!input) return <GenericToolRow part={props.part} onResponse={props.onResponse} />

	if (props.part.state === 'completed' && output) {
		return (
			<Collapsible>
				<div className="border border-border/60 px-2 py-1">
					<div className="flex items-center gap-1.5">
						<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
							<StatusDot state={props.part.state} />
							<GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="text-muted-foreground">websearch</span>
							<span className="min-w-0 truncate text-foreground">{input.query}</span>
							<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent>
						<div className="mt-2 space-y-2 border-border/40 border-t pt-2 text-[10px]">
							{output.sources.map((source, index) => (
								<div key={index} className="space-y-0.5">
									<div className="text-foreground">{source.title ?? source.url}</div>
									<div className="text-muted-foreground">{source.url}</div>
									{String.isNonEmpty(source.publishedDate ?? '') && (
										<div className="text-muted-foreground/70">{source.publishedDate}</div>
									)}
									{String.isNonEmpty(source.text ?? '') && <div className="text-muted-foreground">{source.text}</div>}
								</div>
							))}
						</div>
					</CollapsibleContent>
				</div>
			</Collapsible>
		)
	}

	if (props.part.state === 'error') {
		return <GenericToolRow part={props.part} onResponse={props.onResponse} />
	}

	return (
		<div className="border border-border/60 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="text-muted-foreground">websearch</span>
				<span className="min-w-0 truncate text-foreground">{input.query}</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
		</div>
	)
}

function GenericToolRow(props: {part: ToolPart; onResponse?: (response: AgentResponse) => void}) {
	return (
		<div className="border border-border/60 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				{props.part.state === 'pending-approval' ? (
					<ShieldAlertIcon className="size-3 shrink-0 text-violet-500" />
				) : (
					<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
				)}
				<span className="min-w-0 truncate text-muted-foreground">{props.part.tool}</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
			{props.part.state === 'error' && (
				<pre className="mt-2 overflow-x-auto font-mono text-[10px] text-destructive leading-snug">
					{formatError(props.part.error)}
				</pre>
			)}
		</div>
	)
}

function ApprovalActions(props: {part: ToolPart; onResponse?: (response: AgentResponse) => void}) {
	if (Predicate.isUndefined(props.part.approvalId)) return null

	return (
		<div className="ml-auto flex items-center gap-1">
			<Button
				size="xs"
				variant="outline"
				onClick={() =>
					props.onResponse?.(
						new ToolApprovalResponseEvent({
							approvalId: props.part.approvalId ?? props.part.id,
							decision: 'approve',
							messageId: props.part.messageId,
							toolCallId: props.part.toolCallId
						})
					)
				}
			>
				Allow
			</Button>
			<Button
				size="xs"
				variant="destructive"
				onClick={() =>
					props.onResponse?.(
						new ToolApprovalResponseEvent({
							approvalId: props.part.approvalId ?? props.part.id,
							decision: 'deny',
							messageId: props.part.messageId,
							toolCallId: props.part.toolCallId
						})
					)
				}
			>
				Deny
			</Button>
		</div>
	)
}

function StatusDot(props: {state: ToolPart['state']}) {
	if (props.state === 'running') {
		return <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground/40" />
	}
	if (props.state === 'pending-input' || props.state === 'pending-approval') {
		return <span className="inline-block size-1.5 shrink-0 animate-pulse bg-violet-500" />
	}
	if (props.state === 'completed') {
		return <span className="inline-block size-1.5 shrink-0 bg-emerald-500" />
	}
	if (props.state === 'denied') {
		return <span className="inline-block size-1.5 shrink-0 bg-destructive/60" />
	}
	return <span className="inline-block size-1.5 shrink-0 bg-destructive" />
}
