import {Array} from 'effect'

function sleep(ms: number) {
	return new Promise<void>(resolve => {
		setTimeout(resolve, ms)
	})
}

async function main() {
	process.stdout.write('phase:scroll:start\r\n')
	for (const index of Array.range(0, 19)) {
		process.stdout.write(`scroll-line-${index.toString().padStart(3, '0')}\r\n`)
		await sleep(5)
	}
	process.stdout.write('phase:repaint:start\r\n')
	for (const index of Array.range(0, 23)) {
		process.stdout.write('\u001B[2K\u001B[1G')
		process.stdout.write(`┌ plan ${index.toString().padStart(2, '0')} 🙂 ┐`)
		process.stdout.write('\u001B[1A\u001B[1B')
		await sleep(5)
	}
	process.stdout.write('\r\nphase:sync:start\r\n')
	for (const index of Array.range(0, 11)) {
		process.stdout.write(`\u001B[?2026h\u001B[2K\u001B[1Gsync-${index} wide-🙂\u001B[?2026l\r\n`)
		await sleep(5)
	}
	process.stdout.write('phase:alt:start\r\n')
	process.stdout.write('\u001B[?1049h\u001B[Halt-screen-🙂\r\nmenu > item\r\n')
	await sleep(40)
	process.stdout.write('\u001B[?1049l')
	process.stdout.write('phase:region:start\r\n')
	process.stdout.write('\u001B[2;5r\u001B[2Hregion-a\r\nregion-b\r\n\u001B[r')
	process.stdout.write('\r\nphase:done\r\n')
}

await main()
