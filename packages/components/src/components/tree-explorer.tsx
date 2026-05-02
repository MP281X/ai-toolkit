import {cn} from '#lib/utils.ts'

export function TreeExplorer(props: {className?: string; children: React.ReactNode}) {
	return <div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
}

export function TreeExplorerSection(props: {label?: React.ReactNode; className?: string; children: React.ReactNode}) {
	return (
		<section className={cn('flex flex-col gap-1.5', props.className)}>
			{props.label && (
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pt-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
					{props.label}
				</div>
			)}
			<ul className="flex flex-col gap-px px-0">{props.children}</ul>
		</section>
	)
}

export function TreeExplorerRow(props: {
	selected?: boolean
	onClick?: () => void
	icon?: React.ReactNode
	actions?: React.ReactNode
	children: React.ReactNode
}) {
	const className = cn(
		'grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground',
		props.selected &&
			'bg-muted text-foreground shadow-[inset_1px_0_0_hsl(var(--primary))] hover:bg-muted hover:text-foreground'
	)
	const style = {paddingLeft: 12, paddingRight: 8}
	const content = (
		<>
			<span className="flex min-w-0 flex-1 items-center gap-1.5">
				{props.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{props.icon}</span>}
				<span className="min-w-0 flex-1 truncate">{props.children}</span>
			</span>
			{props.actions}
		</>
	)

	if (props.onClick) {
		return (
			<button
				type="button"
				aria-current={props.selected ? 'page' : undefined}
				onClick={props.onClick}
				className={className}
				style={style}
			>
				{content}
			</button>
		)
	}

	return (
		<div className={className} style={style}>
			{content}
		</div>
	)
}
