import * as CollapsiblePrimitive from '@base-ui/react/collapsible'
import * as EffectRecord from 'effect/Record'
function Collapsible(input: CollapsiblePrimitive.Collapsible.Root.Props) {
	const props = input
	return <CollapsiblePrimitive.Collapsible.Root data-slot="collapsible" {...props} />
}
function CollapsibleTrigger(input: CollapsiblePrimitive.Collapsible.Trigger.Props) {
	const props = input
	return <CollapsiblePrimitive.Collapsible.Trigger data-slot="collapsible-trigger" {...props} />
}
function CollapsibleContent(input: CollapsiblePrimitive.Collapsible.Panel.Props) {
	const props = input
	return <CollapsiblePrimitive.Collapsible.Panel data-slot="collapsible-content" {...props} />
}
export {Collapsible, CollapsibleContent, CollapsibleTrigger}
