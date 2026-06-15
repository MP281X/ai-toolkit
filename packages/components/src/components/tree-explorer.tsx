import {Predicate} from 'effect'

import {cn} from '#lib/utils.ts'

export function TreeExplorer(props: {readonly className?: string; readonly children: React.ReactNode}) {
	return <div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
}

export function TreeExplorerSection(props: {
	readonly label?: React.ReactNode
	readonly className?: string
	readonly children: React.ReactNode
}) {
	return (
		<section className={cn('flex flex-col gap-1', props.className)}>
			{Predicate.isNotUndefined(props.label) && (
				<div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pt-2 font-normal">
					{props.label}
				</div>
			)}
			<ul className="flex flex-col gap-0.5 px-0">{props.children}</ul>
		</section>
	)
}

export function TreeExplorerGroup(props: {readonly className?: string; readonly children: React.ReactNode}) {
	return (
		<ul className={cn('border-border/70 ml-[19px] flex flex-col border-l pl-2', props.className)}>{props.children}</ul>
	)
}

export function TreeExplorerRow(props: {
	readonly selected?: boolean
	readonly onClick?: () => void
	readonly icon: React.ReactNode
	readonly actions?: React.ReactNode
	readonly className?: string
	readonly title?: string
	readonly children: React.ReactNode
}) {
	const label = (
		<span className="flex h-full min-w-0 flex-1 items-center gap-1.5">
			<span className="flex size-3 shrink-0 items-center justify-center [&_svg]:size-3 [&_svg]:shrink-0">
				{props.icon}
			</span>
			<span className="min-w-0 flex-1 truncate">{props.children}</span>
		</span>
	)
	return (
		<div
			aria-current={props.selected === true ? 'page' : undefined}
			className={cn(
				'text-muted-foreground hover:bg-muted/60 hover:text-foreground grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left font-normal',
				props.selected === true &&
					'bg-muted text-foreground hover:bg-muted hover:text-foreground shadow-[inset_1px_0_0_hsl(var(--primary))]',
				props.className
			)}
			style={{paddingLeft: 12, paddingRight: 8}}
			title={props.title}
		>
			{Predicate.isNotUndefined(props.onClick) ? (
				<button
					type="button"
					onClick={props.onClick}
					className="flex h-full min-w-0 items-center border-0 bg-transparent p-0 text-left text-inherit"
				>
					{label}
				</button>
			) : (
				label
			)}
			{props.actions}
		</div>
	)
}
