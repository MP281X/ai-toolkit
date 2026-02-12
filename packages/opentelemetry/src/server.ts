import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import {Config, Effect, Layer, Option} from 'effect'

import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http'
import {BatchSpanProcessor} from '@opentelemetry/sdk-trace-node'

export const OtelLayer = (serviceName: string) =>
	Layer.unwrapScoped(
		Effect.map(
			Config.option(Config.string('VITE_OTEL_URL')),
			Option.match({
				onNone: () => Layer.empty,
				onSome: url =>
					NodeSdk.layer(() => ({
						resource: {serviceName},
						spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({url}))
					}))
			})
		)
	)
