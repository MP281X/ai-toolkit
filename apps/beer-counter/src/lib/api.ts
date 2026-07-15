import {Array, Option, Schema, String, pipe} from 'effect'

function portlessServerOrigin() {
	return pipe(
		Schema.decodeUnknownOption(Schema.String)(import.meta.env['VITE_PORTLESS_BASE_ORIGIN']),
		Option.map(origin => {
			const url = new URL(origin)
			url.hostname = `server.${url.hostname}`
			return url.origin
		}),
		Option.orElse(() =>
			pipe(
				Schema.decodeUnknownOption(Schema.String)(import.meta.env['VITE_PORTLESS_ORIGIN']),
				Option.map(origin => {
					const url = new URL(origin)
					url.hostname = pipe(url.hostname, String.split('.'), Array.drop(1), Array.prepend('server'), Array.join('.'))
					return url.origin
				})
			)
		),
		Option.getOrElse(() => location.origin)
	)
}

export function apiUrl(path: `/api/${string}`) {
	return `${portlessServerOrigin()}${path}`
}
