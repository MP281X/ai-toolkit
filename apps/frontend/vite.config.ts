import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		tanstackRouter({target: 'react', disableLogging: true}),
		react({babel: {plugins: [['babel-plugin-react-compiler']]}}),
		tailwindcss()
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
