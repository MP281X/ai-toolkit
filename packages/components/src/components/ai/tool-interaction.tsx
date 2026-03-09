/** biome-ignore-all lint/suspicious/noArrayIndexKey: stream-derived UI */

import {Array, Option, Schema, String} from 'effect'

import {ToolApprovalResponseEvent, type ToolPart, type ToolResponse, ToolResultEvent} from '@ai-toolkit/ai/schema'
import {
	BashToolInput,
	GlobToolInput,
	GrepToolInput,
	PatchToolInput,
	PatchToolOutput,
	QuestionAnswer,
	QuestionToolInput,
	QuestionToolOutput,
	ReadToolInput,
	ReportIntentToolInput,
	TextToolOutput,
	WebToolInput,
	WebToolOutput,
	WriteToolInput
} from '@ai-toolkit/ai/tools'
import {
	ChevronRightIcon,
	FileTextIcon,
	GlobeIcon,
	HelpCircleIcon,
	LoaderCircleIcon,
	SearchIcon,
	TerminalIcon,
	WrenchIcon
} from 'lucide-react'
import {useState} from 'react'

import {Code} from '#components/render/code.tsx'
import {Button} from '#components/ui/button.tsx'
import {Checkbox} from '#components/ui/checkbox.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {Input} from '#components/ui/input.tsx'
import {RadioGroup, RadioGroupItem} from '#components/ui/radio-group.tsx'
import {formatError} from '#lib/utils.ts'

export function ToolInteraction(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	if (props.part.toolKind === 'question') {
		return props.part.state === 'pending-user-input' ? (
			<PendingQuestionTool part={props.part} onResponse={props.onResponse} />
		) : (
			<QuestionToolRow part={props.part} onResponse={props.onResponse} />
		)
	}

	if (props.part.toolKind === 'report_intent') {
		return <ReportIntentToolRow part={props.part} onResponse={props.onResponse} />
	}

	if (props.part.toolKind === 'web') {
		return <WebToolRow part={props.part} onResponse={props.onResponse} />
	}

	return <GenericToolRow part={props.part} onResponse={props.onResponse} />
}

function ReportIntentToolRow(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	const input = Schema.decodeUnknownSync(ReportIntentToolInput)(props.part.input)

	return (
		<div className="border border-border/60 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="text-muted-foreground">intent</span>
				<span className="min-w-0 truncate text-foreground">{input?.intent ?? props.part.toolName}</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
		</div>
	)
}

function GenericToolRow(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	const output = Option.getOrUndefined(Schema.decodeUnknownOption(TextToolOutput)(props.part.output))

	if (props.part.toolKind === 'read') {
		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">read</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(ReadToolInput)(props.part.input).path}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.toolKind === 'bash') {
		if (props.part.state === 'success' && output?._tag === 'text' && String.isNonEmpty(output.text)) {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">bash</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(BashToolInput)(props.part.input).command}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<div className="mt-1 border-border/40 border-t pt-1">
								<Code code={output.text} lang="bash" className="text-[10px]" />
							</div>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		if (props.part.state === 'error') {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">bash</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(BashToolInput)(props.part.input).command}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
								{formatError(props.part.error)}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">bash</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(BashToolInput)(props.part.input).command}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.toolKind === 'glob') {
		if (props.part.state === 'success' && output?._tag === 'text' && String.isNonEmpty(output.text)) {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">glob</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(GlobToolInput)(props.part.input).pattern}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] leading-snug">
								{output.text}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		if (props.part.state === 'error') {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">glob</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(GlobToolInput)(props.part.input).pattern}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
								{formatError(props.part.error)}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">glob</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(GlobToolInput)(props.part.input).pattern}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.toolKind === 'grep') {
		if (props.part.state === 'success' && output?._tag === 'text' && String.isNonEmpty(output.text)) {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">grep</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(GrepToolInput)(props.part.input).pattern}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] leading-snug">
								{output.text}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		if (props.part.state === 'error') {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">grep</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(GrepToolInput)(props.part.input).pattern}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
								{formatError(props.part.error)}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<SearchIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">grep</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(GrepToolInput)(props.part.input).pattern}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.toolKind === 'write') {
		if (props.part.state === 'success' && output?._tag === 'text' && String.isNonEmpty(output.text)) {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">write</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(WriteToolInput)(props.part.input).path}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] leading-snug">
								{output.text}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		if (props.part.state === 'error') {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">write</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(WriteToolInput)(props.part.input).path}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
								{formatError(props.part.error)}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">write</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(WriteToolInput)(props.part.input).path}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.toolKind === 'patch') {
		const patchOutput = Option.getOrUndefined(Schema.decodeUnknownOption(PatchToolOutput)(props.part.output))

		if (props.part.state === 'success' && patchOutput?._tag === 'patch' && String.isNonEmpty(patchOutput.patch)) {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">patch</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(PatchToolInput)(props.part.input).path ?? props.part.toolName}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] leading-snug">
								{patchOutput.patch}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		if (props.part.state === 'error') {
			return (
				<Collapsible>
					<div className="border border-border/60 px-2 py-1">
						<div className="flex items-center gap-1.5">
							<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
								<StatusDot state={props.part.state} />
								<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">patch</span>
								<span className="min-w-0 truncate text-foreground">
									{Schema.decodeUnknownSync(PatchToolInput)(props.part.input).path ?? props.part.toolName}
								</span>
								<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent>
							<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
								{formatError(props.part.error)}
							</pre>
						</CollapsibleContent>
					</div>
				</Collapsible>
			)
		}

		return (
			<div className="border border-border/60 px-2 py-1">
				<div className="flex items-center gap-1.5 text-[11px]">
					<StatusDot state={props.part.state} />
					<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">patch</span>
					<span className="min-w-0 truncate text-foreground">
						{Schema.decodeUnknownSync(PatchToolInput)(props.part.input).path ?? props.part.toolName}
					</span>
					{props.part.state === 'pending-approval' && (
						<ApprovalActions part={props.part} onResponse={props.onResponse} />
					)}
				</div>
			</div>
		)
	}

	if (props.part.state === 'success' && output?._tag === 'text' && String.isNonEmpty(output.text)) {
		return (
			<Collapsible>
				<div className="border border-border/60 px-2 py-1">
					<div className="flex items-center gap-1.5">
						<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
							<StatusDot state={props.part.state} />
							<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="min-w-0 truncate text-muted-foreground">{props.part.toolName}</span>
							<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent>
						<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] leading-snug">
							{output.text}
						</pre>
					</CollapsibleContent>
				</div>
			</Collapsible>
		)
	}

	if (props.part.state === 'error') {
		return (
			<Collapsible>
				<div className="border border-border/60 px-2 py-1">
					<div className="flex items-center gap-1.5">
						<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
							<StatusDot state={props.part.state} />
							<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="min-w-0 truncate text-muted-foreground">{props.part.toolName}</span>
							<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent>
						<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
							{formatError(props.part.error)}
						</pre>
					</CollapsibleContent>
				</div>
			</Collapsible>
		)
	}

	return (
		<div className="border border-border/60 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="min-w-0 truncate text-muted-foreground">{props.part.toolName}</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
		</div>
	)
}

function WebToolRow(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	const input = Schema.decodeUnknownSync(WebToolInput)(props.part.input)
	const output = Option.getOrUndefined(Schema.decodeUnknownOption(WebToolOutput)(props.part.output))

	if (
		props.part.state === 'success' &&
		output?._tag === 'web' &&
		(String.isNonEmpty(output.text ?? '') || Array.isReadonlyArrayNonEmpty(output.sources))
	) {
		return (
			<Collapsible>
				<div className="border border-border/60 px-2 py-1">
					<div className="flex items-center gap-1.5">
						<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
							<StatusDot state={props.part.state} />
							<GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="text-muted-foreground">web</span>
							<span className="min-w-0 truncate text-foreground">
								{input?.url ?? input?.query ?? props.part.toolName}
							</span>
							<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent>
						<div className="mt-1 space-y-1 border-border/40 border-t pt-1">
							{String.isNonEmpty(output.text ?? '') && <div className="text-[11px] text-foreground">{output.text}</div>}
							{Array.isReadonlyArrayNonEmpty(output.sources) && (
								<div className="space-y-0.5 text-[10px] text-muted-foreground">
									{output.sources.map((source, index) => (
										<div key={index}>{source.url}</div>
									))}
								</div>
							)}
						</div>
					</CollapsibleContent>
				</div>
			</Collapsible>
		)
	}

	if (props.part.state === 'error') {
		return (
			<Collapsible>
				<div className="border border-border/60 px-2 py-1">
					<div className="flex items-center gap-1.5">
						<CollapsibleTrigger className="group/tool flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]">
							<StatusDot state={props.part.state} />
							<GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="text-muted-foreground">web</span>
							<span className="min-w-0 truncate text-foreground">
								{input?.url ?? input?.query ?? props.part.toolName}
							</span>
							<ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform group-aria-expanded/tool:rotate-90" />
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent>
						<pre className="mt-1 overflow-x-auto border-border/40 border-t pt-1 font-mono text-[10px] text-destructive leading-snug">
							{formatError(props.part.error)}
						</pre>
					</CollapsibleContent>
				</div>
			</Collapsible>
		)
	}

	return (
		<div className="border border-border/60 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="text-muted-foreground">web</span>
				<span className="min-w-0 truncate text-foreground">{input?.url ?? input?.query ?? props.part.toolName}</span>
				{props.part.state === 'pending-approval' && <ApprovalActions part={props.part} onResponse={props.onResponse} />}
			</div>
		</div>
	)
}

function QuestionToolRow(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	const input = Schema.decodeUnknownSync(QuestionToolInput)(props.part.input)
	const output = Option.getOrUndefined(Schema.decodeUnknownOption(QuestionToolOutput)(props.part.output))

	return (
		<div className="border border-violet-500/30 bg-violet-500/5 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<HelpCircleIcon className="size-3 shrink-0 text-violet-500/80" />
				<span className="text-violet-200">question</span>
			</div>
			{(input?.questions ?? []).map((question, index) => (
				<div key={index} className="mt-1 text-[11px]">
					<div className="text-foreground">{question.question}</div>
					{output?.answers[index] && (
						<div className="mt-0.5 text-[10px] text-muted-foreground">{output.answers[index].answers.join(', ')}</div>
					)}
				</div>
			))}
			{props.part.state === 'error' && (
				<pre className="mt-1 overflow-x-auto font-mono text-[10px] text-destructive leading-snug">
					{formatError(props.part.error)}
				</pre>
			)}
		</div>
	)
}

function PendingQuestionTool(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	const input = Schema.decodeUnknownSync(QuestionToolInput)(props.part.input)
	const [answers, setAnswers] = useState(() => input.questions.map(() => ({freeform: '', selected: [] as string[]})))

	return (
		<div className="border border-violet-500/30 bg-violet-500/5 px-2 py-1">
			<div className="flex items-center gap-1.5 text-[11px]">
				<StatusDot state={props.part.state} />
				<HelpCircleIcon className="size-3 shrink-0 text-violet-500/80" />
				<span className="text-violet-200">question</span>
			</div>
			{input.questions.map((question, questionIndex) => (
				<div key={questionIndex} className="mt-1">
					<div className="text-[11px] text-foreground">{question.question}</div>
					{question.options.length > 0 && question.multiple === true && (
						<div className="mt-1 space-y-0.5">
							{question.options.map((option, optionIndex) => {
								const id = `${props.part.toolCallId}-${questionIndex}-${optionIndex}`
								return (
									<label key={id} htmlFor={id} className="flex items-start gap-1.5 text-[11px]">
										<Checkbox
											id={id}
											checked={answers[questionIndex]?.selected.includes(option.label) ?? false}
											onCheckedChange={checked =>
												setAnswers(current =>
													current.map((answer, index) =>
														index !== questionIndex
															? answer
															: {
																	freeform: answer.freeform,
																	selected: checked
																		? [...answer.selected, option.label]
																		: answer.selected.filter(value => value !== option.label)
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
					{question.options.length > 0 && question.multiple !== true && (
						<RadioGroup
							className="mt-1"
							value={answers[questionIndex]?.selected[0] ?? ''}
							onValueChange={value =>
								setAnswers(current =>
									current.map((answer, index) =>
										index !== questionIndex ? answer : {freeform: answer.freeform, selected: [value]}
									)
								)
							}
						>
							{question.options.map((option, optionIndex) => {
								const id = `${props.part.toolCallId}-${questionIndex}-${optionIndex}`
								return (
									<label key={id} htmlFor={id} className="flex items-start gap-1.5 text-[11px]">
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
									current.map((answer, index) =>
										index !== questionIndex ? answer : {freeform, selected: answer.selected}
									)
								)
							}}
							placeholder="Type your answer"
						/>
					)}
				</div>
			))}
			<div className="mt-1 flex justify-end">
				<Button
					size="xs"
					variant="outline"
					onClick={() =>
						props.onResponse?.(
							ToolResultEvent.makeUnsafe({
								messageId: props.part.messageId,
								output: QuestionToolOutput.makeUnsafe({
									answers: answers.map(answer =>
										QuestionAnswer.makeUnsafe({
											answers: answer.freeform.length > 0 ? [...answer.selected, answer.freeform] : answer.selected
										})
									)
								}),
								partId: props.part.id,
								requestId: props.part.requestId,
								toolCallId: props.part.toolCallId,
								toolKind: props.part.toolKind,
								toolName: props.part.toolName
							})
						)
					}
				>
					Submit
				</Button>
			</div>
		</div>
	)
}

function ApprovalActions(props: {part: ToolPart; onResponse?: (response: ToolResponse) => void}) {
	return (
		<div className="ml-auto flex items-center gap-1">
			<Button
				size="xs"
				variant="outline"
				onClick={() =>
					props.onResponse?.(
						ToolApprovalResponseEvent.makeUnsafe({
							approvalId: props.part.approvalId ?? props.part.id,
							decision: 'approve',
							messageId: props.part.messageId,
							partId: props.part.approvalId ?? props.part.id,
							toolCallId: props.part.toolCallId,
							toolKind: props.part.toolKind,
							toolName: props.part.toolName
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
						ToolApprovalResponseEvent.makeUnsafe({
							approvalId: props.part.approvalId ?? props.part.id,
							decision: 'deny',
							messageId: props.part.messageId,
							partId: props.part.approvalId ?? props.part.id,
							toolCallId: props.part.toolCallId,
							toolKind: props.part.toolKind,
							toolName: props.part.toolName
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
	if (props.state === 'running' || props.state === 'pending-user-input' || props.state === 'pending-approval') {
		return props.state === 'running' ? (
			<LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground/40" />
		) : (
			<span className="inline-block size-1.5 shrink-0 animate-pulse bg-violet-500" />
		)
	}
	if (props.state === 'success') {
		return <span className="inline-block size-1.5 shrink-0 bg-emerald-500" />
	}
	if (props.state === 'denied') {
		return <span className="inline-block size-1.5 shrink-0 bg-destructive/60" />
	}
	return <span className="inline-block size-1.5 shrink-0 bg-destructive" />
}
