import type {ReactNode} from 'react'

import {cn} from '#lib/utils.ts'

type TreeExplorerProps = {
	className?: string
	children: ReactNode
}

export function TreeExplorer(props: TreeExplorerProps) {
	return <div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
}

type TreeExplorerSectionProps = {
	label: string
	className?: string
	children: ReactNode
}

export function TreeExplorerSection(props: TreeExplorerSectionProps) {
	return (
		<section className={cn('flex flex-col gap-1', props.className)}>
			<div className="px-3 pt-2 font-semibold text-[11px] text-muted-foreground uppercase">{props.label}</div>
			<ul className="flex flex-col gap-0.5 px-1">{props.children}</ul>
		</section>
	)
}

type TreeExplorerItemProps = {
	selected?: boolean
	onClick?: () => void
	icon?: ReactNode
	children: ReactNode
}

export function TreeExplorerItem(props: TreeExplorerItemProps) {
	return (
		<li className="w-full min-w-0">
			<button
				type="button"
				aria-current={props.selected ? 'page' : undefined}
				onClick={props.onClick}
				className={cn(
					'flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
					props.selected && 'bg-primary/15 text-primary'
				)}
			>
				{props.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{props.icon}</span>}
				<span className="min-w-0 flex-1 truncate">{props.children}</span>
			</button>
		</li>
	)
}
