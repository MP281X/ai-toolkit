import * as EffectRecord from 'effect/Record'
import * as ResizablePrimitive from 'react-resizable-panels'

import {cn} from '#lib/utils.ts'
function ResizablePanelGroup(input: ResizablePrimitive.GroupProps) {
	const props = EffectRecord.remove('className')(input)
	return (
		<ResizablePrimitive.Group
			data-slot="resizable-panel-group"
			className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', input.className)}
			{...props}
		/>
	)
}
function ResizablePanel(input: ResizablePrimitive.PanelProps) {
	const props = input
	return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}
function ResizableHandle(input: ResizablePrimitive.SeparatorProps & {withHandle?: boolean}) {
	const props = EffectRecord.remove('className')(EffectRecord.remove('withHandle')(input))
	return (
		<ResizablePrimitive.Separator
			data-slot="resizable-handle"
			className={cn(
				'bg-border ring-offset-background focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90',
				input.className
			)}
			{...props}
		>
			{input.withHandle === true && <div className="bg-border z-10 flex h-6 w-1 shrink-0 rounded-none" />}
		</ResizablePrimitive.Separator>
	)
}
export {ResizableHandle, ResizablePanel, ResizablePanelGroup}
