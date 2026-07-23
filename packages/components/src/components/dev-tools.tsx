import {Array, Option, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'

function Navigation<const Route extends string>(props: {
	readonly routes: readonly [Route, ...(readonly Route[])]
	readonly onChange: (route: Route) => void
}) {
	const [value, setValue] = useState(0)

	function select(index: number) {
		setValue(index)
		props.onChange(props.routes[index] ?? props.routes[0])
	}

	function move(delta: number) {
		select((value + delta + Array.length(props.routes)) % Array.length(props.routes))
	}

	useHotkey('ArrowLeft', () => {
		move(-1)
	})
	useHotkey('ArrowRight', () => {
		move(1)
	})

	return (
		<nav className={cn('fixed bottom-4 left-1/2 z-50 -translate-x-1/2')}>
			<div className="border-border bg-background flex items-center gap-1 border px-1.5 py-1.5">
				{Array.map(props.routes, (route, index) => (
					<Button
						key={route}
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-current={index === value ? 'page' : undefined}
						onClick={() => {
							select(index)
						}}
						className={cn(
							'h-7 w-auto min-w-7 px-2',
							index === value && 'bg-primary/15 text-primary',
							index !== value && 'text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						{pipe(
							route,
							String.split('/'),
							Array.filter(String.isNonEmpty),
							Array.last,
							Option.getOrElse(() => route)
						)}
					</Button>
				))}
			</div>
		</nav>
	)
}

function Variants(props: {readonly children: readonly React.ReactNode[]}) {
	const [value, setValue] = useState(0)
	const variants = Array.length(props.children) === 0 ? [] : Array.range(1, Array.length(props.children))

	function move(delta: number) {
		if (Array.length(props.children) === 0) return
		setValue(prev => (prev + delta + Array.length(props.children)) % Array.length(props.children))
	}

	useHotkey('ArrowLeft', () => {
		move(-1)
	})
	useHotkey('ArrowRight', () => {
		move(1)
	})

	if (Array.length(props.children) === 0) return null

	return (
		<>
			{props.children[value] ?? props.children[0]}
			<nav className={cn('fixed bottom-4 left-1/2 z-50 -translate-x-1/2')}>
				<div className="border-border bg-background flex items-center gap-1 border px-1.5 py-1.5">
					{Array.map(variants, variant => (
						<Button
							key={`variant-${variant}`}
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-current={variant - 1 === value ? 'page' : undefined}
							onClick={() => {
								setValue(variant - 1)
							}}
							className={cn(
								'h-7 w-auto min-w-7 px-2',
								variant - 1 === value && 'bg-primary/15 text-primary',
								variant - 1 !== value && 'text-muted-foreground hover:bg-muted hover:text-foreground'
							)}
						>
							{`${variant}`}
						</Button>
					))}
				</div>
			</nav>
		</>
	)
}

export const DevTools = {Navigation, Variants} as const
