import {useAtomSuspense} from '@effect/atom-react'

import {DateTime, Option, Predicate, pipe} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'

import {systemUsageAtom, usageAtom, usageSubscriptionAtom} from '#lib/state.ts'
import type {AgentUsageWindow} from '@deslop/agent/schema'
import {
	Activity,
	AgentIcon,
	ArrowDown,
	ArrowUp,
	BadgeCheck,
	CalendarDays,
	Clock,
	Cpu,
	MemoryStick,
	Server
} from '@deslop/components/icons'
import {formatError, formatNumber, formatTimeUntil, formatTimestamp} from '@deslop/components/utils'

const providers = ['codex', 'claude'] as const

function utilizationClass(utilization: number) {
	if (utilization >= 90) return 'text-destructive'
	if (utilization >= 75) return 'text-amber-500'
	return 'text-foreground'
}

function WindowValue(input: {readonly icon: React.ReactNode; readonly window: AgentUsageWindow}) {
	const resets = pipe(Option.fromNullishOr(input.window.resetsAt), Option.flatMap(DateTime.make))

	return (
		<span className="flex min-w-0 flex-1 items-center justify-between gap-1.5 px-2.5">
			<span className="flex items-center gap-1.5">
				<span className="text-muted-foreground flex shrink-0 items-center [&_svg]:size-2.5">{input.icon}</span>
				<span className={utilizationClass(input.window.utilization)}>{Math.round(input.window.utilization)}%</span>
			</span>
			{Option.isSome(resets) && (
				<span className="text-muted-foreground min-w-0 truncate" title={`resets ${formatTimestamp(resets.value)}`}>
					{formatTimeUntil(resets.value)}
				</span>
			)}
		</span>
	)
}

function SubscriptionValue(input: {readonly layer: 'claude' | 'codex'}) {
	const subscription = useAtomSuspense(usageSubscriptionAtom(input.layer), {includeFailure: true})

	if (AsyncResult.isFailure(subscription)) {
		return (
			<span
				className="text-muted-foreground flex min-w-0 flex-1 items-center truncate px-2.5"
				title={formatError(subscription.cause)}
			>
				—
			</span>
		)
	}
	if (!AsyncResult.isSuccess(subscription)) {
		return <span className="text-muted-foreground flex flex-1 items-center px-2.5">…</span>
	}

	return (
		<span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2.5">
			<span className="text-muted-foreground flex shrink-0 items-center [&_svg]:size-2.5">
				<BadgeCheck />
			</span>
			<span className="min-w-0 truncate">{subscription.value}</span>
		</span>
	)
}

function MetricValue(input: {
	readonly compact?: boolean
	readonly icon: React.ReactNode
	readonly title?: string
	readonly utilization: number
}) {
	return (
		<span
			className={
				input.compact === true
					? 'flex min-w-0 flex-1 items-center justify-center gap-1 px-1.5'
					: 'flex min-w-0 flex-1 items-center gap-1.5 px-2.5'
			}
			title={input.title}
		>
			<span className="text-muted-foreground flex shrink-0 items-center [&_svg]:size-2.5">{input.icon}</span>
			<span className={utilizationClass(input.utilization)}>{Math.round(input.utilization)}%</span>
		</span>
	)
}

function SystemWindows() {
	const usage = useAtomSuspense(systemUsageAtom, {includeFailure: true})

	if (AsyncResult.isFailure(usage)) {
		return (
			<span
				className="text-muted-foreground flex min-w-0 flex-1 items-center truncate px-2.5"
				title={formatError(usage.cause)}
			>
				{formatError(usage.cause)}
			</span>
		)
	}
	if (!AsyncResult.isSuccess(usage)) {
		return <span className="text-muted-foreground flex flex-1 items-center px-2.5">…</span>
	}

	return (
		<>
			<MetricValue compact icon={<Cpu />} title={`CPU ${Math.round(usage.value.cpu)}%`} utilization={usage.value.cpu} />
			<MetricValue
				compact
				icon={<MemoryStick />}
				title={`System memory ${Math.round(usage.value.memory)}%`}
				utilization={usage.value.memory}
			/>
			<MetricValue
				compact
				icon={<Server />}
				title={`Node heap ${Math.round(usage.value.nodeHeap)}%`}
				utilization={usage.value.nodeHeap}
			/>
		</>
	)
}

function ProviderWindows(input: {readonly layer: 'claude' | 'codex'}) {
	const usage = useAtomSuspense(usageAtom(input.layer), {includeFailure: true})

	if (AsyncResult.isFailure(usage)) {
		return (
			<span
				className="text-muted-foreground flex min-w-0 flex-1 items-center truncate px-2.5"
				title={formatError(usage.cause)}
			>
				{formatError(usage.cause)}
			</span>
		)
	}
	if (!AsyncResult.isSuccess(usage)) {
		return <span className="text-muted-foreground flex flex-1 items-center px-2.5">…</span>
	}

	return (
		<>
			<WindowValue icon={<Clock />} window={usage.value.fiveHour} />
			<WindowValue icon={<CalendarDays />} window={usage.value.weekly} />
			<SubscriptionValue layer={input.layer} />
		</>
	)
}

function TokenMetricValue(input: {readonly icon?: React.ReactNode; readonly value: string}) {
	return (
		<span className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2.5">
			{Predicate.isNotUndefined(input.icon) && (
				<span className="text-muted-foreground flex shrink-0 items-center [&_svg]:size-2.5">{input.icon}</span>
			)}
			<span className="min-w-0 truncate">{input.value}</span>
		</span>
	)
}

function TokenWindows(input: {readonly layer: 'claude' | 'codex'}) {
	const usage = useAtomSuspense(usageAtom(input.layer), {includeFailure: true})

	if (AsyncResult.isFailure(usage)) {
		return (
			<span
				className="text-muted-foreground flex min-w-0 flex-1 items-center truncate px-2.5"
				title={formatError(usage.cause)}
			>
				{formatError(usage.cause)}
			</span>
		)
	}
	if (!AsyncResult.isSuccess(usage)) {
		return <span className="text-muted-foreground flex flex-1 items-center px-2.5">…</span>
	}

	return (
		<>
			<TokenMetricValue icon={<ArrowDown />} value={formatNumber(usage.value.tokens.input)} />
			<TokenMetricValue icon={<ArrowUp />} value={formatNumber(usage.value.tokens.output)} />
			<TokenMetricValue value={formatNumber(usage.value.tokens.cached)} />
		</>
	)
}

function LoadingValue() {
	return <span className="text-muted-foreground flex min-w-0 flex-1 items-center px-2.5">…</span>
}

export function UsageStripFallback() {
	return (
		<div className="flex shrink-0 flex-col divide-y border-t font-mono text-[11px]">
			<div className="flex h-7 min-w-0 items-stretch divide-x">
				<span className="flex w-8 shrink-0 items-center justify-center">
					<Activity className="text-muted-foreground size-3" />
				</span>
				<LoadingValue />
				<LoadingValue />
				<LoadingValue />
			</div>
			{providers.map(layer => (
				<div key={layer} className="flex h-14 min-w-0 items-stretch divide-x">
					<span className="flex w-8 shrink-0 items-center justify-center">
						<AgentIcon layer={layer} />
					</span>
					<span className="flex min-w-0 flex-1 flex-col divide-y">
						<span className="flex h-7 min-w-0 items-stretch divide-x">
							<LoadingValue />
							<LoadingValue />
							<LoadingValue />
						</span>
						<span className="flex h-7 min-w-0 items-stretch divide-x">
							<LoadingValue />
							<LoadingValue />
							<LoadingValue />
						</span>
					</span>
				</div>
			))}
		</div>
	)
}

export function UsageStrip() {
	return (
		<div className="flex shrink-0 flex-col divide-y border-t font-mono text-[11px]">
			<div className="flex h-7 min-w-0 items-stretch divide-x">
				<span className="flex w-8 shrink-0 items-center justify-center">
					<Activity className="text-muted-foreground size-3" />
				</span>
				<SystemWindows />
			</div>
			{providers.map(layer => (
				<div key={layer} className="flex h-14 min-w-0 items-stretch divide-x">
					<span className="flex w-8 shrink-0 items-center justify-center">
						<AgentIcon layer={layer} />
					</span>
					<span className="flex min-w-0 flex-1 flex-col divide-y">
						<span className="flex h-7 min-w-0 items-stretch divide-x">
							<ProviderWindows layer={layer} />
						</span>
						<span className="flex h-7 min-w-0 items-stretch divide-x">
							<TokenWindows layer={layer} />
						</span>
					</span>
				</div>
			))}
		</div>
	)
}
