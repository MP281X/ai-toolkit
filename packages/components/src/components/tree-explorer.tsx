import {Predicate} from 'effect'

import {cn} from '#lib/utils.ts'

export function TreeExplorer(props: {className?: string; children: React.ReactNode}) {
	return <div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
}

export function TreeExplorerSection(props: {label?: React.ReactNode; className?: string; children: React.ReactNode}) {
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

export function TreeExplorerRow(props: {
	selected?: boolean
	onClick?: () => void
	icon?: React.ReactNode
	actions?: React.ReactNode
	title?: string
	children: React.ReactNode
}) {
	const className = cn(
		'text-muted-foreground hover:bg-muted/60 hover:text-foreground grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left font-normal',
		props.selected === true &&
			'bg-muted text-foreground hover:bg-muted hover:text-foreground shadow-[inset_1px_0_0_hsl(var(--primary))]'
	)
	const label = (
		<span className="flex h-full min-w-0 flex-1 items-center gap-1.5">
			{Predicate.isNotUndefined(props.icon) && (
				<span className="flex size-3 shrink-0 items-center justify-center [&_svg]:size-3 [&_svg]:shrink-0">
					{props.icon}
				</span>
			)}
			<span className="min-w-0 flex-1 truncate">{props.children}</span>
		</span>
	)

	if (Predicate.isNotUndefined(props.onClick) && Predicate.isNotUndefined(props.actions)) {
		return (
			<div
				aria-current={props.selected === true ? 'page' : undefined}
				className={className}
				style={{paddingLeft: 12, paddingRight: 8}}
				title={props.title}
			>
				<button
					type="button"
					onClick={props.onClick}
					className="flex h-full min-w-0 items-center border-0 bg-transparent p-0 text-left text-inherit"
				>
					{label}
				</button>
				{props.actions}
			</div>
		)
	}

	if (Predicate.isNotUndefined(props.onClick)) {
		return (
			<button
				type="button"
				aria-current={props.selected === true ? 'page' : undefined}
				onClick={props.onClick}
				className={className}
				style={{paddingLeft: 12, paddingRight: 8}}
				title={props.title}
			>
				{label}
				{props.actions}
			</button>
		)
	}

	return (
		<div className={className} style={{paddingLeft: 12, paddingRight: 8}} title={props.title}>
			{label}
			{props.actions}
		</div>
	)
}
