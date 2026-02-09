import {Effect, pipe, Schema, Stream} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'

import {CommitSuggestion, type RepoPath} from './schema.ts'

class CommitError extends Schema.TaggedError<CommitError>()('CommitError', {
	message: Schema.String
}) {}

const runGitText = (repoPath: RepoPath, args: readonly string[]) =>
	Effect.tryPromise({
		try: async () => {
			const proc = Bun.spawn(['git', ...args], {cwd: repoPath, stdout: 'pipe', stderr: 'pipe'})
			const [exitCode, stdout, stderr] = await Promise.all([
				proc.exited,
				proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(''),
				proc.stderr ? new Response(proc.stderr).text() : Promise.resolve('')
			])
			if (exitCode !== 0) throw CommitError.make({message: stderr || 'git failed'})
			return stdout
		},
		catch: cause => CommitError.make({message: `${cause}`})
	})

const collectText = (stream: Stream.Stream<unknown, unknown, unknown>) =>
	Stream.runFold(stream, '', (text, part) => {
		if (typeof part !== 'object' || part === null) return text
		const tag = (part as {readonly _tag?: string})._tag
		if (tag === 'text-delta' && 'text' in (part as {readonly text?: string}))
			return `${text}${(part as {readonly text?: string}).text ?? ''}`
		return text
	})

export const commitSuggestions = (repoPath: RepoPath) =>
	Effect.gen(function* () {
		const ai = yield* AiSdk

		const diff = yield* runGitText(repoPath, ['diff', '--cached', '--no-color'])
		const status = yield* runGitText(repoPath, ['status', '--short'])
		const history = yield* runGitText(repoPath, ['log', '-5', '--pretty=format:%s'])

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

		const raw = yield* collectText(stream)

		const suggestions = yield* pipe(
			Effect.try({
				try: () => JSON.parse(raw),
				catch: cause => CommitError.make({message: `${cause}`})
			}),
			Effect.flatMap(Schema.decodeUnknown(Schema.Array(CommitSuggestion)))
		)

		return suggestions
	})
