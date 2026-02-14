import tailwindcss from '@tailwindcss/vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import {nitro} from 'nitro/vite'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		tanstackStart({
			prerender: {
				enabled: true,
				failOnError: true,
				autoStaticPathsDiscovery: true
			}
		}),
		react({babel: {plugins: [['babel-plugin-react-compiler']]}}),
		tailwindcss({optimize: true}),
		nitro({preset: 'bun'})
	],
	build: {
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		rolldownOptions: {experimental: {lazyBarrel: true}}
	}
})
