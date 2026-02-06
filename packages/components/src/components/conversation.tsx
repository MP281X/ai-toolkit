import {ArrowDown} from 'lucide-react'
import {useLayoutEffect, useRef, useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'

export function Conversation(props: {children?: React.ReactElement[]; className?: string}) {
	const stickRef = useRef(true)
	const scrollRef = useRef<HTMLDivElement>(null)
	const [showScrollButton, setShowScroll] = useState(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on item count change
	useLayoutEffect(() => {
		const element = scrollRef.current
		if (!(element && stickRef.current)) return
		element.scrollTop = element.scrollHeight
	}, [props.children?.length])

	function handleScroll() {
		const element = scrollRef.current
		if (!element) return
		const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100
		stickRef.current = atBottom
		setShowScroll(!atBottom)
	}

	function scrollBottom() {
		const element = scrollRef.current
		if (!element) return
		element.scrollTop = element.scrollHeight
		stickRef.current = true
		setShowScroll(false)
	}

	return (
		<div className={cn('relative flex h-full flex-col', props.className)}>
			<div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" onScroll={handleScroll}>
				{props.children}
			</div>

			{showScrollButton && (
				<Button
					size="icon"
					variant="outline"
					className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
					onClick={scrollBottom}
				>
					<ArrowDown />
				</Button>
			)}
		</div>
	)
}
