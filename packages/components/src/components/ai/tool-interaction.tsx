import {Array as EffectArray} from 'effect'

import type {ToolApprovalRequest, ToolCall, ToolContent, ToolOutputDenied} from '@ai-toolkit/ai/schema'
import {AlertTriangleIcon, CheckCircleIcon, ChevronRightIcon, HelpCircleIcon, WrenchIcon} from 'lucide-react'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {Textarea} from '#components/ui/textarea.tsx'

type QuestionOption = {label: string; description?: string}

export function ToolInteraction(props: {
	part: ToolCall | ToolApprovalRequest | ToolOutputDenied
	onResponse?: (response: ToolContent) => void
}) {
	if (props.part._tag === 'tool-call') {
		if (props.part.toolName !== 'question') return <ToolCallView part={props.part} />
		return <QuestionTool part={props.part} onResponse={props.onResponse} />
	}

	if (props.part._tag === 'tool-approval-request') {
		return <ToolApproval part={props.part} onResponse={props.onResponse} />
	}

	return <ToolDenied part={props.part} />
}

function ToolCallView(props: {part: ToolCall}) {
	return (
		<details className="group border border-border">
			<summary className="flex w-full list-none items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-left font-medium text-[11px] uppercase leading-none tracking-wide [&::-webkit-details-marker]:hidden [&::marker]:hidden">
				<ChevronRightIcon className="size-3 -translate-y-px text-muted-foreground transition-transform group-open:rotate-90" />
				<WrenchIcon className="size-3 -translate-y-px text-muted-foreground" />
				<span className="text-foreground">{props.part.toolName}</span>
			</summary>
			<pre className="overflow-x-auto border-border border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground leading-snug">
				{JSON.stringify(props.part.input, null, 2)}
			</pre>
		</details>
	)
}

function ToolDenied(props: {part: ToolOutputDenied}) {
	return (
		<div className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
			<AlertTriangleIcon className="mt-0.5 size-3.5" />
			<div className="space-y-1">
				<div className="font-semibold uppercase tracking-wide">Execution denied</div>
				<div className="text-[11px]">{props.part.toolName}</div>
			</div>
		</div>
	)
}

function ToolApproval(props: {part: ToolApprovalRequest; onResponse?: (response: ToolContent) => void}) {
	return (
		<div className="flex items-start gap-2 border border-border bg-muted/40 px-3 py-2 text-xs">
			<HelpCircleIcon className="mt-0.5 size-3.5 text-muted-foreground" />
			<div className="flex-1 space-y-2">
				<div className="font-semibold text-[11px] uppercase tracking-wide">Approval required</div>
				<div className="text-[11px] text-muted-foreground">Tool call: {props.part.toolCallId}</div>
				<div className="flex items-center gap-2">
					<Button
						size="xs"
						variant="outline"
						onClick={() =>
							props.onResponse?.({
								_tag: 'tool-approval-response',
								approvalId: props.part.approvalId,
								approved: true
							})
						}
					>
						Allow
					</Button>
					<Button
						size="xs"
						variant="outline"
						onClick={() =>
							props.onResponse?.({
								_tag: 'tool-approval-response',
								approvalId: props.part.approvalId,
								approved: false
							})
						}
					>
						Deny
					</Button>
				</div>
			</div>
		</div>
	)
}

function QuestionTool(props: {part: ToolCall; onResponse?: (response: ToolContent) => void}) {
	const data = props.part.input as {
		questions?: ReadonlyArray<{header?: string; question?: string; options?: QuestionOption[]; multiple?: boolean}>
	}
	const questions = EffectArray.isArray(data?.questions) ? data.questions : []
	const [responses, setResponsesEntry, setSingleResponse, setResponsesFromText] = useQuestionState(questions)

	if (questions.length === 0) return <ToolCallView part={props.part} />

	return (
		<div className="space-y-3 border border-border bg-muted/20 px-3 py-2">
			<div className="flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
				<HelpCircleIcon className="size-3.5" />
				Questions
			</div>
			<div className="space-y-3">
				{questions.map((question, index) => (
					<div key={`${question.header ?? 'question'}-${index}`} className="space-y-2">
						<div className="font-semibold text-xs uppercase tracking-wide">
							{question.header ?? `Question ${index + 1}`}
						</div>
						{question.question ? <div className="text-muted-foreground text-xs">{question.question}</div> : null}
						{question.options && question.options.length > 0 ? (
							question.multiple ? (
								<div className="space-y-2">
									{question.options.map(option => (
										<div key={option.label} className="flex items-start gap-2 text-xs">
											<Checkbox
												checked={responses[index]?.includes(option.label) ?? false}
												onCheckedChange={checked => setResponsesEntry(index, option.label, Boolean(checked))}
												aria-label={option.label}
											/>
											<div className="space-y-0.5">
												<div className="font-medium">{option.label}</div>
												{option.description ? (
													<div className="text-[11px] text-muted-foreground">{option.description}</div>
												) : null}
											</div>
										</div>
									))}
								</div>
							) : (
								<RadioGroup
									value={responses[index]?.[0] ?? ''}
									onValueChange={value => setSingleResponse(index, value)}
								>
									{question.options.map(option => (
										<div key={option.label} className="flex items-start gap-2 text-xs">
											<RadioGroupItem value={option.label} aria-label={option.label} />
											<div className="space-y-0.5">
												<div className="font-medium">{option.label}</div>
												{option.description ? (
													<div className="text-[11px] text-muted-foreground">{option.description}</div>
												) : null}
											</div>
										</div>
									))}
								</RadioGroup>
							)
						) : (
							<Input
								value={responses[index]?.[0] ?? ''}
								onChange={event => setSingleResponse(index, event.currentTarget.value)}
								placeholder="Type your answer"
							/>
						)}
						{question.options && question.options.length > 0 && question.multiple ? (
							<Textarea
								value={responses[index]?.join(', ') ?? ''}
								onChange={event => setResponsesFromText(index, event.currentTarget.value)}
								placeholder="Optional notes"
								className="min-h-20"
							/>
						) : null}
					</div>
				))}
			</div>
			<div className="flex items-center justify-between border-border/60 border-t pt-2">
				<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
					<CheckCircleIcon className="size-3" />
					Responses ready
				</div>
				<Button
					size="xs"
					variant="outline"
					onClick={() =>
						props.onResponse?.({
							_tag: 'tool-result',
							toolCallId: props.part.toolCallId,
							toolName: props.part.toolName,
							output: responses.map((response, index) => ({
								header: questions[index]?.header,
								question: questions[index]?.question,
								response
							}))
						})
					}
				>
					Submit
				</Button>
			</div>
		</div>
	)
}

function useQuestionState(questions: ReadonlyArray<{multiple?: boolean}>) {
	const [responses, setResponses] = useState<string[][]>(() => questions.map(() => []))

	function setResponsesFromText(index: number, value: string) {
		setResponses(current => {
			const next = [...current]
			next[index] = value
				.split(',')
				.map(entry => entry.trim())
				.filter(Boolean)
			return next
		})
	}

	function setResponsesEntry(index: number, label: string, checked: boolean) {
		setResponses(current => {
			const next = [...current]
			const currentValues = new Set(next[index] ?? [])
			if (checked) currentValues.add(label)
			else currentValues.delete(label)
			next[index] = EffectArray.fromIterable(currentValues)
			return next
		})
	}

	function setSingleResponse(index: number, value: string) {
		setResponses(current => {
			const next = [...current]
			next[index] = value ? [value] : []
			return next
		})
	}

	return [responses, setResponsesEntry, setSingleResponse, setResponsesFromText] as const
}
