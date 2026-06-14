function sleep(ms: number) {
	return new Promise<void>(resolve => {
		setTimeout(resolve, ms)
	})
}

async function main() {
	process.stdout.write('phase:scroll:start\r\n')
	for (let index = 0; index < 20; index += 1) {
		process.stdout.write(`scroll-line-${index.toString().padStart(3, '0')}\r\n`)
		await sleep(5)
	}
	process.stdout.write('phase:repaint:start\r\n')
	for (let index = 0; index < 24; index += 1) {
		process.stdout.write('\u001b[2K\u001b[1G')
		process.stdout.write(`┌ plan ${index.toString().padStart(2, '0')} 🙂 ┐`)
		process.stdout.write('\u001b[1A\u001b[1B')
		await sleep(5)
	}
	process.stdout.write('\r\nphase:sync:start\r\n')
	for (let index = 0; index < 12; index += 1) {
		process.stdout.write(`\u001b[?2026h\u001b[2K\u001b[1Gsync-${index} wide-🙂\u001b[?2026l\r\n`)
		await sleep(5)
	}
	process.stdout.write('phase:alt:start\r\n')
	process.stdout.write('\u001b[?1049h\u001b[Halt-screen-🙂\r\nmenu > item\r\n')
	await sleep(40)
	process.stdout.write('\u001b[?1049l')
	process.stdout.write('phase:region:start\r\n')
	process.stdout.write('\u001b[2;5r\u001b[2Hregion-a\r\nregion-b\r\n\u001b[r')
	process.stdout.write('\r\nphase:done\r\n')
}

await main()
