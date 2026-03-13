import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		//
		tanstackRouter({target: 'react', autoCodeSplitting: true}),
		react(),
		// @ts-expect-error types
		babel({
			presets: [reactCompilerPreset()],
			parserOpts: {plugins: ['jsx', 'typescript']}
		}),
		tailwindcss({optimize: true})
	],
	server: {
		proxy: {
			'/api/rpc': {target: 'http://localhost:3011', changeOrigin: true, ws: true}
		}
	},
	build: {
		outDir: 'dist/client',
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		rolldownOptions: {experimental: {lazyBarrel: true}}
	}
})
