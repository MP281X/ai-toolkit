import {Array, Option, pipe, String} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'

export const DevTools = {
	Navigation: <const Route extends string>(props: {
		routes: readonly [Route, ...Route[]]
		onChange: (route: Route) => void
	}) => {
		const [value, setValue] = useState(props.routes[0])

		function select(next: Route) {
			setValue(next)
			props.onChange(next)
		}

		function move(delta: number) {
			for (let index = 0; index < props.routes.length; index++) {
				if (props.routes[index] !== value) continue
				select(props.routes[(index + delta + props.routes.length) % props.routes.length] ?? props.routes[0])
				return
			}

			select(props.routes[0])
		}

		useHotkey('ArrowLeft', () => move(-1))
		useHotkey('ArrowRight', () => move(1))

		return (
			<nav className={cn('fixed bottom-4 left-1/2 z-50 -translate-x-1/2')}>
				<div className="flex items-center gap-1 border border-border bg-background px-1.5 py-1.5 font-mono text-xs">
					{Array.map(props.routes, route => (
						<Button
							key={route}
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-current={route === value ? 'page' : undefined}
							onClick={() => select(route)}
							className={cn(
								'h-7 w-auto min-w-7 px-2 text-xs',
								route === value && 'bg-primary/15 text-primary',
								route !== value && 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
}
