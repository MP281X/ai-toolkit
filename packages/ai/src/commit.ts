import {Effect, Schema, Stream} from 'effect'

import {GitService} from '@ai-toolkit/git/service'
import {RepoPath} from '@ai-toolkit/git/schema'

import {AiSdk} from './service.ts'

export class CommitSuggestion extends Schema.Class<CommitSuggestion>('CommitSuggestion')({
	message: Schema.String,
	branch: Schema.String,
	description: Schema.String
}) {}

function collectText(stream: Stream.Stream<unknown>) {
	return Stream.runFold(stream, '', (text, part) => {
		if (typeof part !== 'object' || part === null) return text
		const tag = (part as {readonly _tag?: string})._tag
		if (tag === 'text-delta' && 'text' in (part as {readonly text?: string}))
			return `${text}${(part as {readonly text?: string}).text ?? ''}`
		return text
	})
}

export function commitSuggestions(repoPath: RepoPath) {
	return Effect.gen(function* () {
		const ai = yield* AiSdk
		const git = yield* GitService

		const diff = yield* git.raw({repoPath, args: ['diff', '--cached', '--no-color']})
		const status = yield* git.raw({repoPath, args: ['status', '--short']})
		const history = yield* git.raw({repoPath, args: ['log', '-5', '--pretty=format:%s']})

		const prompt = `
You are an expert git commit assistant.
Recent commit messages:
${history}

Staged changes (git diff --cached):
${diff || '(no staged diff)'}

Status:
${status}

Generate three concise git commit suggestions as JSON array.
Each item must include:
- message: 50-65 characters, imperative mood.
- branch: kebab-case short branch suggestion (e.g., chore/update-readme).
- description: one sentence summary of the staged changes.
Only output JSON.`

		const stream = ai.stream({
			prompt,
			model: {provider: 'opencode_zen', model: 'kimi-k2.5-free'}
		})

		const raw = yield* collectText(Stream.orDie(stream))

		return yield* Schema.decodeUnknown(Schema.parseJson(Schema.Array(CommitSuggestion)))(raw)
	})
}
