import {LegendList} from '@legendapp/list/react'

import {cn} from '#lib/utils.ts'

export function Conversation<T extends {id: unknown}>(props: {
	items: readonly T[]
	children: (item: T, index: number) => React.ReactNode
	className?: string
}) {
	return (
		<LegendList<T>
			data={props.items}
			keyExtractor={item => `${item.id}`}
			renderItem={input => props.children(input.item, input.index)}
			estimatedItemSize={240}
			initialScrollIndex={props.items.length - 1}
			alignItemsAtEnd
			maintainScrollAtEnd
			maintainVisibleContentPosition
			className={cn('min-h-0 flex-1 overflow-x-hidden overscroll-y-contain', props.className)}
			ListHeaderComponent={<div className="h-2" />}
			ListFooterComponent={<div className="h-2" />}
		/>
	)
}
