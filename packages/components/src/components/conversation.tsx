import {Array} from 'effect'

import {LegendList} from '@legendapp/list/react'

import {cn} from '#lib/utils.ts'

export function Conversation<T extends {readonly id: unknown}>(props: {
	readonly items: readonly T[]
	readonly children: (item: T, index: number) => React.ReactNode
	readonly className?: string
}) {
	return (
		<LegendList<T>
			data={props.items}
			keyExtractor={item => `${item.id}`}
			renderItem={input => props.children(input.item, input.index)}
			estimatedItemSize={240}
			initialScrollIndex={Array.length(props.items) - 1}
			alignItemsAtEnd
			maintainScrollAtEnd
			maintainVisibleContentPosition
			className={cn('min-h-0 flex-1 overflow-x-hidden overscroll-y-contain', props.className)}
			ListHeaderComponent={<div className="h-2" />}
			ListFooterComponent={<div className="h-2" />}
		/>
	)
}
