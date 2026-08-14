import {defineAppConfig} from '@deslop/vite'

export default defineAppConfig({
	pack: {deps: {neverBundle: [/^@lydell\/node-pty(?:\/.*)?$/u]}},
	server: {external: ['@xterm/headless']}
})
