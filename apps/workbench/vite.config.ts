import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import {defineConfig} from 'vite-plus'

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		outDir: 'dist/client',
		rolldownOptions: {experimental: {lazyBarrel: true}}
	},
	pack: {
		banner: '#!/usr/bin/env -S node --max-old-space-size=16384 --heapsnapshot-near-heap-limit=3 --report-on-fatalerror',
		clean: false,
		deps: {neverBundle: [/^@lydell\/node-pty(?:\/.*)?$/]},
		entry: ['src/main.server.ts'],
		format: 'esm',
		outDir: 'dist',
		outputOptions: {entryFileNames: 'server.js'},
		platform: 'node',
		target: 'node26'
	},
	plugins: [
		tanstackRouter({autoCodeSplitting: true, target: 'react'}),
		react(),
		babel({parserOpts: {plugins: ['jsx', 'typescript']}, presets: [reactCompilerPreset()]}),
		tailwindcss({optimize: true})
	],
	server: {forwardConsole: true}
})
