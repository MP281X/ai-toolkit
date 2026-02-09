import {Effect} from 'effect'

import {RepoService} from '#lib/repoService.ts'
import {ReposRpcs} from './contracts.ts'

export const ReposLive = ReposRpcs.toLayer(
	Effect.gen(function* () {
		const repoService = yield* RepoService

		return ReposRpcs.of({
			ListRoots: () => repoService.listRoots.pipe(Effect.orDie),
			AddRoot: root => repoService.addRoot(root).pipe(Effect.orDie),
			RemoveRoot: root => repoService.removeRoot(root).pipe(Effect.orDie),
			ListRepositories: () => repoService.listRepositories.pipe(Effect.orDie),
			ScanRepositories: () => repoService.scanRepositories.pipe(Effect.orDie),
			GetRepository: repoPath => repoService.getRepository(repoPath).pipe(Effect.orDie),
			GetDiff: args => repoService.getDiff(args.repoPath, args.filePath, args.staged).pipe(Effect.orDie),
			StageTargets: args => repoService.stageTargets(args.repoPath, args.targets).pipe(Effect.orDie),
			RevertTargets: args => repoService.revertTargets(args.repoPath, args.targets).pipe(Effect.orDie),
			ListComments: repoPath => repoService.listComments(repoPath).pipe(Effect.orDie),
			SaveComment: args => repoService.saveComment(args.repoPath, args.comment).pipe(Effect.orDie),
			GenerateContent: repoPath => repoService.generateContent(repoPath).pipe(Effect.orDie),
			ExportPlan: repoPath => repoService.exportPlan(repoPath).pipe(Effect.orDie),
			CreatePullRequest: args =>
				repoService.createPullRequest(args.repoPath, args.title, args.body, args.branch).pipe(Effect.orDie)
		})
	})
)
