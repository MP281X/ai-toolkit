import {Schema} from 'effect'

export type RepoPath = typeof RepoPath.Type
export const RepoPath = Schema.String.pipe(Schema.brand('RepoPath'))

export const Timestamp = Schema.Number

type RepositoryProps = {
	readonly path: RepoPath
	readonly name: string
	readonly defaultBranch?: string
	readonly lastOpenedAt: number
}
export class Repository extends Schema.Class<RepositoryProps>('Repository')({
	path: RepoPath,
	name: Schema.String,
	defaultBranch: Schema.optional(Schema.String),
	lastOpenedAt: Timestamp
}) {}

type RepoStatusProps = {
	readonly branch?: string
	readonly ahead: number
	readonly behind: number
	readonly staged: ReadonlyArray<string>
	readonly unstaged: ReadonlyArray<string>
	readonly untracked: ReadonlyArray<string>
}
export class RepoStatus extends Schema.Class<RepoStatusProps>('RepoStatus')({
	branch: Schema.optional(Schema.String),
	ahead: Schema.Number,
	behind: Schema.Number,
	staged: Schema.Array(Schema.String),
	unstaged: Schema.Array(Schema.String),
	untracked: Schema.Array(Schema.String)
}) {}

type DiffLineContextProps = {
	readonly _tag: 'context'
	readonly text: string
	readonly oldLine: number
	readonly newLine: number
}
export class DiffLineContext extends Schema.TaggedClass<DiffLineContextProps>()('context', {
	text: Schema.String,
	oldLine: Schema.Number,
	newLine: Schema.Number
}) {}

type DiffLineAddProps = {
	readonly _tag: 'add'
	readonly text: string
	readonly newLine: number
}
export class DiffLineAdd extends Schema.TaggedClass<DiffLineAddProps>()('add', {
	text: Schema.String,
	newLine: Schema.Number
}) {}

type DiffLineDelProps = {
	readonly _tag: 'del'
	readonly text: string
	readonly oldLine: number
}
export class DiffLineDel extends Schema.TaggedClass<DiffLineDelProps>()('del', {
	text: Schema.String,
	oldLine: Schema.Number
}) {}

export type DiffLine = typeof DiffLine.Type
export const DiffLine = Schema.Union(DiffLineContext, DiffLineAdd, DiffLineDel)
export type DiffLineAddType = typeof DiffLineAdd.Type
export type DiffLineDelType = typeof DiffLineDel.Type

type DiffHunkProps = {
	readonly id: string
	readonly oldStart: number
	readonly oldLines: number
	readonly newStart: number
	readonly newLines: number
	readonly header: string
	readonly lines: ReadonlyArray<DiffLine>
}
export class DiffHunk extends Schema.Class<DiffHunkProps>('DiffHunk')({
	id: Schema.String,
	oldStart: Schema.Number,
	oldLines: Schema.Number,
	newStart: Schema.Number,
	newLines: Schema.Number,
	header: Schema.String,
	lines: Schema.Array(DiffLine)
}) {}

type DiffFileProps = {
	readonly path: string
	readonly oldPath?: string
	readonly status: 'modified' | 'added' | 'deleted' | 'renamed'
	readonly isBinary: boolean
	readonly hunks: ReadonlyArray<DiffHunk>
}
export class DiffFile extends Schema.Class<DiffFileProps>('DiffFile')({
	path: Schema.String,
	oldPath: Schema.optional(Schema.String),
	status: Schema.Literal('modified', 'added', 'deleted', 'renamed'),
	isBinary: Schema.Boolean,
	hunks: Schema.Array(DiffHunk)
}) {}

type DiffQueryProps = {
	readonly repoPath: RepoPath
	readonly source: 'working' | 'staged'
}
export class DiffQuery extends Schema.Class<DiffQueryProps>('DiffQuery')({
	repoPath: RepoPath,
	source: Schema.Literal('working', 'staged')
}) {}

type StageSelectionProps = {
	readonly repoPath: RepoPath
	readonly path: string
	readonly kind: 'file' | 'directory' | 'hunk' | 'line'
	readonly hunkId?: string
	readonly oldLine?: number
	readonly newLine?: number
	readonly patch?: string
	readonly reverse?: boolean
}
export class StageSelection extends Schema.Class<StageSelectionProps>('StageSelection')({
	repoPath: RepoPath,
	path: Schema.String,
	kind: Schema.Literal('file', 'directory', 'hunk', 'line'),
	hunkId: Schema.optional(Schema.String),
	oldLine: Schema.optional(Schema.Number),
	newLine: Schema.optional(Schema.Number),
	patch: Schema.optional(Schema.String),
	reverse: Schema.optional(Schema.Boolean)
}) {}
