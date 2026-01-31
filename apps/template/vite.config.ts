import tailwindcss from '@tailwindcss/vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import {nitro} from 'nitro/vite'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackStart(),
		nitro({preset: 'bun'}),
		react({babel: {plugins: [['babel-plugin-react-compiler']]}})
	],
	build: {
		chunkSizeWarningLimit: 2000,
		rolldownOptions: {
			onwarn: (warning, warn) => {
				if (warning && (warning.code === 'EVAL' || /direct `eval`/.test(globalThis.String(warning.message)))) return
				warn(warning)
			},
			output: {
				manualChunks(id) {
					if (!id.includes('node_modules')) return
					if (id.includes('/@tanstack/')) return 'tanstack'
					if (id.includes('/react-dom') || id.includes('/react/')) return 'react'
					if (id.includes('/@effect-atom/')) return 'effect-atom'
					if (id.includes('/effect/') || id.includes('/@effect/')) return 'effect'
					if (id.includes('/@opentelemetry/') || id.includes('/protobufjs/')) return 'opentelemetry'
					if (id.includes('/@ai-toolkit/')) return 'ai-toolkit'
					return 'vendor'
				}
			}
		}
	}
})
