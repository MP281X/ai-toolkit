import {Schema} from 'effect'

export const StoredFile = Schema.Struct({id: Schema.String})

export class FileStorageError extends Schema.TaggedErrorClass<FileStorageError>()('FileStorageError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
