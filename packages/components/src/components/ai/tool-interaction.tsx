/** biome-ignore-all lint/suspicious/noArrayIndexKey: question keys */
import {Array, Predicate} from 'effect'

import {type ToolCallPart, type ToolMessagePart, ToolResultPart} from '@ai-toolkit/ai/schema'
import {CheckCircleIcon, ChevronRightIcon, HelpCircleIcon, SearchIcon, WrenchIcon} from 'lucide-react'
import {useState} from 'react'

import {Badge} from '#components/ui/badge.tsx'
import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {Textarea} from '#components/ui/textarea.tsx'

type QuestionOption = {label: string; description?: string}
type QuestionItem = {header?: string; question?: string; options?: QuestionOption[]; multiple?: boolean}

export function ToolInteraction(props: {part: ToolCallPart; onResponse?: (response: ToolMessagePart) => void}) {
	switch (props.part.toolName) {
		case 'question':
			return <QuestionTool part={props.part} onResponse={props.onResponse} />
		case 'web_search':
			return <WebSearchTool part={props.part} />
		default:
			return <DefaultToolCall part={props.part} />
	}
}

function DefaultToolCall(props: {part: ToolCallPart}) {
	if (Predicate.isNullish(props.part.input)) {
		return (
			<div className="flex items-center gap-1.5 border border-border bg-muted/40 px-3 py-1.5 text-[11px] uppercase leading-none tracking-wide">
				<WrenchIcon className="size-3 text-muted-foreground" />
				<span className="text-foreground">{props.part.toolName}</span>
			</div>
		)
	}

	return (
		<Collapsible className="border border-border">
			<CollapsibleTrigger className="group/collapsible flex w-full items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-[11px] uppercase leading-none tracking-wide">
				<ChevronRightIcon className="size-3 text-muted-foreground transition-transform group-aria-expanded/collapsible:rotate-90" />
				<WrenchIcon className="size-3 text-muted-foreground" />
				<span className="text-foreground">{props.part.toolName}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="overflow-x-auto border-border border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground leading-snug">
					{JSON.stringify(props.part.input, null, 2)}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	)
}

function WebSearchTool(props: {part: ToolCallPart}) {
	const query = (props.part.input as {query?: string} | null)?.query
	return (
		<div className="flex items-center gap-1.5 border border-border bg-muted/40 px-3 py-1.5 text-[11px] leading-none">
			<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
			<span className="font-medium text-foreground uppercase tracking-wide">web_search</span>
			{query && <span className="truncate text-muted-foreground">{query}</span>}
		</div>
	)
}

function QuestionTool(props: {part: ToolCallPart; onResponse?: (response: ToolMessagePart) => void}) {
	const questions: readonly QuestionItem[] = (props.part.input as {questions?: QuestionItem[]} | null)?.questions ?? []
	const [submitted, setSubmitted] = useState(false)
	const [responses, setResponsesEntry, setSingleResponse, setResponsesFromText] = useQuestionState(questions)

	if (Array.isReadonlyArrayEmpty(questions)) return <DefaultToolCall part={props.part} />

	if (submitted) {
		return (
			<div className="flex items-center gap-2 border border-border bg-muted/40 px-3 py-1.5 text-[11px] leading-none">
				<CheckCircleIcon className="size-3 text-primary" />
				<Badge variant="secondary">answered</Badge>
			</div>
		)
	}

	return (
		<div className="space-y-3 border border-border px-3 py-2">
			<div className="flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
				<HelpCircleIcon className="size-3" />
				Questions
			</div>
			<div className="space-y-3">
				{questions.map((question, index) => (
					<div key={`${question.header ?? 'question'}-${index}`} className="space-y-2">
						<div className="font-semibold text-xs uppercase tracking-wide">
							{question.header ?? `Question ${index + 1}`}
						</div>
						{question.question && <div className="text-muted-foreground text-xs">{question.question}</div>}
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
												{option.description && (
													<div className="text-[11px] text-muted-foreground">{option.description}</div>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<RadioGroup value={responses[index]?.[0]} onValueChange={value => setSingleResponse(index, value)}>
									{question.options.map(option => (
										<div key={option.label} className="flex items-start gap-2 text-xs">
											<RadioGroupItem value={option.label} aria-label={option.label} />
											<div className="space-y-0.5">
												<div className="font-medium">{option.label}</div>
												{option.description && (
													<div className="text-[11px] text-muted-foreground">{option.description}</div>
												)}
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
						{question.options && question.options.length > 0 && question.multiple && (
							<Textarea
								value={responses[index]?.join(', ') ?? ''}
								onChange={event => setResponsesFromText(index, event.currentTarget.value)}
								placeholder="Optional notes"
								className="min-h-20"
							/>
						)}
					</div>
				))}
			</div>
			<div className="flex items-center justify-end border-border/60 border-t pt-2">
				<Button
					size="xs"
					variant="outline"
					onClick={() => {
						setSubmitted(true)
						props.onResponse?.(
							new ToolResultPart({
								toolCallId: props.part.toolCallId,
								toolName: props.part.toolName,
								output: responses.map((response, index) => ({
									header: questions[index]?.header,
									question: questions[index]?.question,
									response
								}))
							})
						)
					}}
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
			next[index] = Array.fromIterable(currentValues)
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
