import {createBuilder, createSchema, string, table} from '@rocicorp/zero'

const user = table('user')
	.columns({
		id: string(),
		name: string()
	})
	.primaryKey('id')

export type schema = typeof schema
export const schema = createSchema({
	tables: [user]
})

export const zql = createBuilder(schema)

declare module '@rocicorp/zero' {
	interface DefaultTypes {
		schema: schema
	}
}
