// oxlint-disable-next-line import/no-namespace -- Effect exposes this SDK module as a namespace-style service surface.
import * as WebSdk from '@effect/opentelemetry/WebSdk'

import {Config, Effect, Layer, Option} from 'effect'

import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {SimpleSpanProcessor} from '@opentelemetry/sdk-trace-web'

export function OtelLayer(serviceName: string) {
	return Layer.unwrap(
		Effect.map(
			Config.option(Config.string('VITE_OTEL_URL')),
			Option.match({
				onNone: () => Layer.empty,
				onSome: url =>
					WebSdk.layer(() => ({
						resource: {serviceName},
						spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter({url}))
					}))
			})
		)
	)
}
