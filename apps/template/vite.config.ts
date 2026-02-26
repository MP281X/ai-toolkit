import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
	plugins: [
		tanstackRouter({target: 'react', autoCodeSplitting: true}),
		react({babel: {plugins: [['babel-plugin-react-compiler']]}}),
		tailwindcss({optimize: true})
	],
	server: {
		proxy: {
			'/api/auth': {target: 'http://localhost:3001', changeOrigin: true},
			'/api/rpc': {target: 'http://localhost:3001', changeOrigin: true, ws: true}
		}
	},
	build: {
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		rolldownOptions: {experimental: {lazyBarrel: true}}
	}
})
