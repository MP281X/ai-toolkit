import {Array, Option, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'

// oxlint-disable-next-line typescript/no-namespace -- DevTools exposes related debug helpers under a single component namespace.
export namespace DevTools {
	export function Navigation<const Route extends string>(props: {
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

	export function Variants(props: {readonly children: readonly React.ReactNode[]}) {
		const [value, setValue] = useState(0)

		function move(delta: number) {
			setValue(prev => (prev + delta + Array.length(props.children)) % Array.length(props.children))
		}

		useHotkey('ArrowLeft', () => {
			move(-1)
		})
		useHotkey('ArrowRight', () => {
			move(1)
		})

		return (
			<>
				{props.children[value] ?? props.children[0]}
				<nav className={cn('fixed bottom-4 left-1/2 z-50 -translate-x-1/2')}>
					<div className="border-border bg-background flex items-center gap-1 border px-1.5 py-1.5">
						{Array.map(props.children, (_child, index) => (
							<Button
								key={index}
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-current={index === value ? 'page' : undefined}
								onClick={() => {
									setValue(index)
								}}
								className={cn(
									'h-7 w-auto min-w-7 px-2',
									index === value && 'bg-primary/15 text-primary',
									index !== value && 'text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
							>
								{`${index + 1}`}
							</Button>
						))}
					</div>
				</nav>
			</>
		)
	}
}
