import * as WebSdk from '@effect/opentelemetry/WebSdk'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web'
import { Config, Effect, Layer, Option } from 'effect'

export const OtelLayer = (serviceName: string) =>
	Layer.unwrapScoped(
		Effect.map(
			Config.option(Config.string('OTEL_URL')),
			Option.match({
				onNone: () => Layer.empty,
				onSome: url =>
					WebSdk.layer(() => ({
						resource: { serviceName },
						spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url }))
					}))
			})
		)
	)
