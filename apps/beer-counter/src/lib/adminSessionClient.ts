import {Schema} from 'effect'

import {apiUrl} from '#lib/api.ts'
import type {LoginCredentials} from '#lib/sessions.ts'

function sessionUrl() {
	return apiUrl('/api/admin/session')
}

export async function hasAdminSession() {
	const response = await fetch(sessionUrl(), {credentials: 'include'})
	return response.status === 204
}

export async function createAdminSession(credentials: typeof LoginCredentials.Type) {
	const response = await fetch(sessionUrl(), {
		body: Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(credentials),
		credentials: 'include',
		headers: {'content-type': 'application/json'},
		method: 'POST'
	})
	return response.status === 204
}
