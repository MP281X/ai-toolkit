import {Array, Option, Predicate, pipe, Schema} from 'effect'

import {
	ModelId,
	type ModelId as ModelValue,
	models,
	ProviderId,
	type ProviderId as ProviderValue
} from '@ai-toolkit/ai/catalog'

import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '#components/ui/select.tsx'

const providerId = Schema.decodeUnknownOption(ProviderId)
const modelId = Schema.decodeUnknownOption(ModelId)

export function ModelSelector(props: {
	model: {model: ModelValue; provider: ProviderValue}
	onModelChange: (value: {model: ModelValue; provider: ProviderValue}) => void
}) {
	return (
		<Select
			value={`${props.model.provider}:${props.model.model}`}
			onValueChange={value => {
				if (Predicate.isNullish(value)) return
				const [provider, model] = value.split(':', 2)
				const nextProvider = Option.getOrUndefined(providerId(provider))
				const nextModel = Option.getOrUndefined(modelId(model))
				if (Predicate.isUndefined(nextProvider) || Predicate.isUndefined(nextModel)) return
				props.onModelChange({provider: nextProvider, model: nextModel})
			}}
		>
			<SelectTrigger size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{pipe(
					models,
					Array.filter(item => item.agent === 'ai'),
					Array.map(item => (
						<SelectItem key={`${item.provider}:${item.model}`} value={`${item.provider}:${item.model}`}>
							{item.provider} / {item.model}
						</SelectItem>
					))
				)}
			</SelectContent>
		</Select>
	)
}
