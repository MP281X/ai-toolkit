import {cpus, freemem, totalmem} from 'node:os'

import {Array} from 'effect'

function percentage(input: {readonly total: number; readonly used: number}) {
	if (input.total <= 0) return 0
	return Math.max(0, Math.min(100, (input.used / input.total) * 100))
}

export function cpuTimes() {
	return Array.reduce(cpus(), {idle: 0, total: 0}, (total, cpu) => ({
		idle: total.idle + cpu.times.idle,
		total: total.total + cpu.times.idle + cpu.times.irq + cpu.times.nice + cpu.times.sys + cpu.times.user
	}))
}

export function cpuUtilization(input: {
	readonly before: ReturnType<typeof cpuTimes>
	readonly after: ReturnType<typeof cpuTimes>
}) {
	const total = input.after.total - input.before.total
	const idle = input.after.idle - input.before.idle
	return percentage({total, used: total - idle})
}

export function nodeMemoryUtilization() {
	return percentage({total: totalmem(), used: totalmem() - freemem()})
}

function darwinPageCount(input: {readonly label: string; readonly vmStatOutput: string}) {
	return Number(new RegExp(`${input.label}:\\s+(\\d+)\\.`, 'u').exec(input.vmStatOutput)?.[1] ?? 0)
}

export function darwinMemoryUtilization(input: {readonly memsizeOutput: string; readonly vmStatOutput: string}) {
	const pageSize = Number(/page size of (\d+) bytes/u.exec(input.vmStatOutput)?.[1] ?? 0)
	const total = Number(/(\d+)/u.exec(input.memsizeOutput)?.[1] ?? 0)
	const usedPages =
		darwinPageCount({label: 'Pages active', vmStatOutput: input.vmStatOutput}) +
		darwinPageCount({label: 'Pages wired down', vmStatOutput: input.vmStatOutput}) +
		darwinPageCount({label: 'Pages occupied by compressor', vmStatOutput: input.vmStatOutput})

	return percentage({total, used: usedPages * pageSize})
}
