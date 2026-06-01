export function splitParallelCommands(script: string) {
	const commands: string[] = []
	let current = ''
	let quote: '"' | "'" | undefined
	let escaped = false

	for (let index = 0; index < script.length; index += 1) {
		const char = script[index]
		if (escaped) {
			current += char
			escaped = false
		} else if (char === '\\') {
			current += char
			escaped = true
		} else if (quote) {
			current += char
			if (char === quote) quote = undefined
		} else if (char === '"' || char === "'") {
			current += char
			quote = char
		} else if (char === '&' && script[index + 1] === '&') {
			current += '&&'
			index += 1
		} else if (char === '&') {
			const command = current.trim()
			if (command) commands.push(command)
			current = ''
		} else {
			current += char
		}
	}

	const command = current.trim()
	if (command) commands.push(command)

	return commands
}
