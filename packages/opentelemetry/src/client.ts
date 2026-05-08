import * as WebSdk from '@effect/opentelemetry/WebSdk'
import {Config, Effect, Layer, Option, pipe} from 'effect'

import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {SimpleSpanProcessor} from '@opentelemetry/sdk-trace-web'

export function OtelLayer(serviceName: string) {
	return Layer.unwrap(
		pipe(
			Config.option(Config.string('VITE_OTEL_URL')).asEffect(),
			Effect.map(
				Option.match({
					onNone: () => Layer.empty,
					onSome: url => {
						return WebSdk.layer(() => {
							return {
								resource: {serviceName},
								spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter({url}))
							}
						})
					}
				})
			)
		)
	)
}
