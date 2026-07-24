import {hash} from 'node:crypto'
import {cpSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {NodeRuntime} from '@effect/platform-node'

import {Effect} from 'effect'

const program = Effect.sync(() => {
	const workspace = process.cwd()
	const roots = [workspace, join(workspace, 'apps', 'workbench')]

	for (const root of roots) {
		const cacheRoot = join(tmpdir(), 'deslop-vite-cache', hash('sha256', root, 'hex'))
		const links = [
			{cachePath: join(cacheRoot, 'task'), linkPath: join(root, 'node_modules', '.vite')},
			{cachePath: join(cacheRoot, 'config'), linkPath: join(root, 'node_modules', '.vite-temp')}
		]

		for (const link of links) {
			mkdirSync(link.cachePath, {recursive: true})
			mkdirSync(dirname(link.linkPath), {recursive: true})

			try {
				const current = lstatSync(link.linkPath)

				if (current.isSymbolicLink() && realpathSync(link.linkPath) === realpathSync(link.cachePath)) continue
				if (!current.isSymbolicLink()) cpSync(link.linkPath, link.cachePath, {force: true, recursive: true})
			} catch {}

			rmSync(link.linkPath, {force: true, recursive: true})
			symlinkSync(link.cachePath, link.linkPath, process.platform === 'win32' ? 'junction' : 'dir')
		}
	}
})

NodeRuntime.runMain(program)
