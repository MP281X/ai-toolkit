import {cpus, freemem, totalmem} from 'node:os'
import {getHeapStatistics} from 'node:v8'

import {Array, Effect} from 'effect'

export const cpuTimes = Effect.fnUntraced(function* () {
	return Array.reduce(cpus(), {idle: 0, total: 0}, (total, cpu) => ({
		idle: total.idle + cpu.times.idle,
		total: total.total + cpu.times.idle + cpu.times.irq + cpu.times.nice + cpu.times.sys + cpu.times.user
	}))
})

export function cpuUtilization(input: {
	readonly before: {readonly idle: number; readonly total: number}
	readonly after: {readonly idle: number; readonly total: number}
}) {
	const total = input.after.total - input.before.total
	const idle = input.after.idle - input.before.idle
	if (total <= 0) return 0
	return Math.max(0, Math.min(100, ((total - idle) / total) * 100))
}

export const osMemoryUtilization = Effect.sync(() => {
	const total = totalmem()
	if (total <= 0) return 0
	return Math.max(0, Math.min(100, ((total - freemem()) / total) * 100))
})

export function nodeProcessUsage(input?: {readonly heapLimitBytes: number; readonly heapUsedBytes: number}) {
	const heapUsedBytes = input?.heapUsedBytes ?? process.memoryUsage().heapUsed
	const heapLimitBytes = input?.heapLimitBytes ?? getHeapStatistics().heap_size_limit
	const heapUtilization = heapLimitBytes <= 0 ? 0 : Math.max(0, Math.min(100, (heapUsedBytes / heapLimitBytes) * 100))

	return {heapLimitBytes, heapUsedBytes, heapUtilization}
}
