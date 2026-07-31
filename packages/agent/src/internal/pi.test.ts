import {assert, describe, it} from '@effect/vitest'

import {Option} from 'effect'

import {mutationReason} from './pi.ts'

describe('Pi Bash mutation guard', () => {
	it('blocks wrapped and absolute Git and GitHub mutations', () => {
		for (const command of [
			'/usr/bin/git commit -m change',
			'command git push origin HEAD',
			'env GH_TOKEN=secret gh pr merge 12',
			'sudo -- git reset --hard HEAD',
			'g=git; $g commit -m change',
			'h=gh; $h pr close 1',
			'eval git\\ commit\\ -m\\ change',
			'g""it commit -m change',
			'g\\it commit -m change',
			'g$()it commit -m change',
			'g${x:-i}t commit -m change',
			'g`printf i`t --version',
			'/usr/bin/gi? commit -m change',
			'git remote add upstream https://github.com/example/example',
			'git remote set-url origin https://github.com/example/example',
			'git remote remove origin',
			'$(printf git) push origin HEAD',
			'printf Z2l0IHB1c2g= | base64 -d | bash',
			'printf Z2l0IC0tdmVyc2lvbg== | base64 -d > /tmp/command; source /tmp/command',
			'/tmp/generated-script',
			'/home/example/generated-script',
			"node -e \"require('child_process').execSync('git push')\""
		]) {
			assert.isTrue(Option.isSome(mutationReason(command)), command)
		}
	})

	it('allows read-only Git and GitHub inspection', () => {
		for (const command of [
			'git status --short',
			'/usr/bin/git diff',
			'command gh pr view 12',
			'git -C /tmp status --short',
			'gh --repo MP281X/deslop pr view 1',
			'git show $REV',
			'git remote -v',
			'git remote get-url origin',
			'git show HEAD:README.md',
			"rg --files -g '*.ts'"
		]) {
			assert.isTrue(Option.isNone(mutationReason(command)), command)
		}
	})
})
