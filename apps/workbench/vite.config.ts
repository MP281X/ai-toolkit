import {defineAppConfig} from '@deslop/vite'

export default defineAppConfig({
	pack: {
		entry: ['src/main.ts', 'src/code-mode.ts', 'src/code-mode-worker.ts'],
		outputOptions: {entryFileNames: chunk => (chunk.name === 'main' ? 'server.js' : '[name].js')}
	}
})
