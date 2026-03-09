import type {Plugin} from '@opencode-ai/plugin'

const resources = [
	{
		branch: 'main',
		name: 'effect',
		url: 'https://github.com/Effect-TS/effect-smol'
	},
	{
		branch: 'main',
		name: 'tanstack-router',
		url: 'https://github.com/TanStack/router',
		searchPath: 'packages/react-router/src'
	},
	{
		branch: 'main',
		name: 'ai',
		url: 'https://github.com/vercel/ai',
		searchPath: 'packages/ai/src'
	},
	{
		branch: 'main',
		name: 'pierre-diffs',
		url: 'https://github.com/pierrecomputer/pierre',
		searchPath: 'packages/diffs/src'
	},
	{
		branch: 'main',
		name: 'lexical',
		url: 'https://github.com/facebook/lexical',
		searchPath: 'packages'
	},
	{
		branch: 'main',
		name: 'copilot-sdk',
		url: 'https://github.com/github/copilot-sdk',
		searchPath: 'nodejs'
	},
	{
		branch: 'main',
		name: 'opencode-sdk',
		url: 'https://github.com/anomalyco/opencode',
		searchPath: 'packages/sdk/js/src/v2'
	}
]

export const plugin: Plugin = async ({client, $}) => {
	await $`mkdir -p ".opencode/resources"`.text()

	void Promise.all(
		resources.map(async resource => {
			try {
				await $`test -d ".opencode/resources/${resource.name}"`.text()

				await $`git -C ".opencode/resources/${resource.name}" pull --ff-only --quiet`.text()
				client.tui.showToast({body: {message: `Pulled ${resource.name}`, variant: 'info'}})
			} catch (e) {
				if (resource.searchPath) {
					await $`git clone --depth 1 --filter=blob:none --no-checkout --branch "${resource.branch}" "${resource.url}" ".opencode/resources/${resource.name}" --quiet`.text()
					await $`git -C ".opencode/resources/${resource.name}" sparse-checkout init --cone`.text()
					await $`git -C ".opencode/resources/${resource.name}" sparse-checkout set "${resource.searchPath}"`.text()
					await $`git -C ".opencode/resources/${resource.name}" checkout`.text()
				} else {
					await $`git clone --depth 1 --branch "${resource.branch}" "${resource.url}" ".opencode/resources/${resource.name}" --quiet`.text()
				}
				client.tui.showToast({body: {message: `Cloned ${resource.name}`, variant: 'info'}})
			}
		})
	)

	return {}
}
