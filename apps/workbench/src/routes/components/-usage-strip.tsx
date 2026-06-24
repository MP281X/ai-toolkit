import {useAtomValue} from '@effect/atom-react'

import {DateTime, Option, pipe} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'

import {systemUsageAtom, usageAtom} from '#lib/state.ts'
import {Activity, AgentIcon, CalendarDays, Clock, Cpu, MemoryStick, Server} from '@deslop/components/icons'
import {formatBytes, formatError, formatTimestamp, formatTimeUntil} from '@deslop/components/utils'
import type {UsageWindow} from '@deslop/usage/schema'

const providers = ['claude', 'codex'] as const

function utilizationClass(utilization: number) {
	if (utilization >= 90) return 'text-destructive'
	if (utilization >= 75) return 'text-amber-500'
	return 'text-foreground'
}

function WindowValue(input: {readonly icon: React.ReactNode; readonly window: UsageWindow}) {
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
	const usage = useAtomValue(systemUsageAtom)

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
			<MetricValue
				compact
				icon={<Cpu />}
				title={`CPU ${Math.round(usage.value.cpuUtilization)}%`}
				utilization={usage.value.cpuUtilization}
			/>
			<MetricValue
				compact
				icon={<MemoryStick />}
				title={`System memory ${Math.round(usage.value.memoryUtilization)}%`}
				utilization={usage.value.memoryUtilization}
			/>
			<MetricValue
				compact
				icon={<Server />}
				title={`Node heap ${formatBytes(usage.value.nodeProcess.heapUsedBytes)} / ${formatBytes(usage.value.nodeProcess.heapLimitBytes)}`}
				utilization={usage.value.nodeProcess.heapUtilization}
			/>
		</>
	)
}

function ProviderWindows(input: {readonly layer: 'claude' | 'codex'}) {
	const usage = useAtomValue(usageAtom(input.layer))

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
		</>
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
				<div key={layer} className="flex h-7 min-w-0 items-stretch divide-x">
					<span className="flex w-8 shrink-0 items-center justify-center">
						<AgentIcon layer={layer} />
					</span>
					<ProviderWindows layer={layer} />
				</div>
			))}
		</div>
	)
}
