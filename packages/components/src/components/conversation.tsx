import {ArrowDown} from 'lucide-react'
import {useLayoutEffect, useRef, useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'

export function Conversation(props: {children?: React.ReactElement[]; className?: string}) {
	const stickRef = useRef(true)
	const scrollRef = useRef<HTMLDivElement>(null)
	const [showScrollButton, setShowScroll] = useState(false)

	useLayoutEffect(() => {
		// biome-ignore lint/plugin: access variable
		const element = scrollRef.current
		if (!element) return

		const observer = new MutationObserver(() => {
			if (!stickRef.current) return
			element.scrollTop = element.scrollHeight
		})

		observer.observe(element, {childList: true, subtree: true, characterData: true})
		return () => observer.disconnect()
	}, [])

	function handleScroll() {
		// biome-ignore lint/plugin: access variable
		const element = scrollRef.current
		if (!element) return
		// biome-ignore lint/plugin: simple check
		const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100
		stickRef.current = atBottom
		setShowScroll(!atBottom)
	}

	function scrollBottom() {
		// biome-ignore lint/plugin: access variable
		const element = scrollRef.current
		if (!element) return
		element.scrollTop = element.scrollHeight
		stickRef.current = true
		setShowScroll(false)
	}

	return (
		<div className={'relative flex min-h-0 flex-1 flex-col'}>
			<div
				ref={scrollRef}
				className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', props.className)}
				onScroll={handleScroll}
			>
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
