import * as WebSdk from '@effect/opentelemetry/WebSdk'
import {Config, Effect, Layer, Option} from 'effect'

import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {BatchSpanProcessor} from '@opentelemetry/sdk-trace-web'

export const OtelLayer = (serviceName: string) =>
	Layer.unwrap(
		Effect.map(
			Config.option(Config.string('VITE_OTEL_URL')).asEffect(),
			Option.match({
				onNone: () => Layer.empty,
				onSome: url =>
					WebSdk.layer(() => ({
						resource: {serviceName},
						spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({url}))
					}))
			})
		)
	)
