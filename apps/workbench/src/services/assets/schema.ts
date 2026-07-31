import {Schema} from 'effect'

import {RepositoryName} from '#services/repositories/schema.ts'

export const Asset = Schema.Struct({id: Schema.String, repository: RepositoryName, url: Schema.String})

export class AssetError extends Schema.TaggedErrorClass<AssetError>()('AssetError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
