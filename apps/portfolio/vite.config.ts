import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		outDir: 'dist/client',
		rolldownOptions: {experimental: {lazyBarrel: true}}
	},
	plugins: [
		tanstackRouter({autoCodeSplitting: true, target: 'react'}),
		react(),
		babel({parserOpts: {plugins: ['jsx', 'typescript']}, presets: [reactCompilerPreset()]}),
		tailwindcss({optimize: true})
	],
	server: {proxy: {'/api/rpc': {changeOrigin: true, target: 'http://localhost:3001', ws: true}}}
})
