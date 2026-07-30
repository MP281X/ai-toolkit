import {defineAppConfig} from '@deslop/vite'

export default defineAppConfig({
	pack: {deps: {neverBundle: [/^@lydell\/node-pty(?:\/.*)?$/]}},
	server: {external: ['@xterm/headless']}
})
