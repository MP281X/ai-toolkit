import {hash} from 'node:crypto'
import {lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {NodeRuntime} from '@effect/platform-node'

import {Effect} from 'effect'

const program = Effect.sync(() => {
	const workspace = process.cwd()
	const cacheRoot = join(tmpdir(), 'deslop-vite-cache', hash('sha256', workspace, 'hex'))
	const links = [
		{cachePath: join(cacheRoot, 'task'), linkPath: join(workspace, 'node_modules', '.vite')},
		{cachePath: join(cacheRoot, 'config'), linkPath: join(workspace, 'node_modules', '.vite-temp')}
	]

	for (const link of links) {
		mkdirSync(link.cachePath, {recursive: true})
		mkdirSync(dirname(link.linkPath), {recursive: true})

		try {
			if (lstatSync(link.linkPath).isSymbolicLink() && realpathSync(link.linkPath) === realpathSync(link.cachePath)) {
				continue
			}
		} catch {}

		rmSync(link.linkPath, {force: true, recursive: true})
		symlinkSync(link.cachePath, link.linkPath, process.platform === 'win32' ? 'junction' : 'dir')
	}
})

NodeRuntime.runMain(program)
