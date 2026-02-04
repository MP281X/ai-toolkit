import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		tanstackRouter({target: 'react', disableLogging: true}),
		tailwindcss({optimize: true}),
		react({babel: {plugins: [['babel-plugin-react-compiler']]}})
	],
	build: {
		chunkSizeWarningLimit: 2000,
		rolldownOptions: {
			experimental: {lazyBarrel: true},
			treeshake: {invalidImportSideEffects: false, moduleSideEffects: false}
		}
	}
})
