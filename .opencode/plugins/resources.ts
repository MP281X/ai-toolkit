import type {Plugin} from '@opencode-ai/plugin'

const resources = [
	{branch: 'main', name: 'pierre-diffs', url: 'https://github.com/pierrecomputer/pierre'},
	{branch: 'canary', name: 'better-auth', url: 'https://github.com/better-auth/better-auth'},
	{branch: 'main', name: 'effect', url: 'https://github.com/Effect-TS/effect-smol'},
	{branch: 'main', name: 'tanstack-router', url: 'https://github.com/TanStack/router'},
	// ai
	{branch: 'main', name: 'ai-sdk', url: 'https://github.com/vercel/ai'},
	{branch: 'main', name: 'codex', url: 'https://github.com/openai/codex'},
	{branch: 'main', name: 'copilot-sdk', url: 'https://github.com/github/copilot-sdk'}
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
				await $`git clone --depth 1 --branch "${resource.branch}" "${resource.url}" ".opencode/resources/${resource.name}" --quiet`.text()
				client.tui.showToast({body: {message: `Cloned ${resource.name}`, variant: 'info'}})
			}
		})
	)

	return {}
}
