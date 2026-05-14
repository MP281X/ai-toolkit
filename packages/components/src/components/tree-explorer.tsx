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
		<section className={cn('flex flex-col gap-1.5', props.className)}>
			{props.label && (
				<div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pt-2 text-[11px] font-semibold tracking-wide uppercase">
					{props.label}
				</div>
			)}
			<ul className="flex flex-col gap-px px-0">{props.children}</ul>
		</section>
	)
}

export function TreeExplorerRow(props: {
	readonly selected?: boolean
	readonly onClick?: () => void
	readonly icon?: React.ReactNode
	readonly actions?: React.ReactNode
	readonly children: React.ReactNode
}) {
	const className = cn(
		'text-muted-foreground hover:bg-muted/60 hover:text-foreground grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left text-xs',
		props.selected &&
			'bg-muted text-foreground hover:bg-muted hover:text-foreground shadow-[inset_1px_0_0_hsl(var(--primary))]'
	)
	const label = (
		<span className="flex min-w-0 flex-1 items-center gap-1.5">
			{props.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{props.icon}</span>}
			<span className="min-w-0 flex-1 truncate">{props.children}</span>
		</span>
	)

	if (props.onClick && props.actions) {
		return (
			<div
				aria-current={props.selected ? 'page' : undefined}
				className={className}
				style={{paddingLeft: 12, paddingRight: 8}}
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

	if (props.onClick) {
		return (
			<button
				type="button"
				aria-current={props.selected ? 'page' : undefined}
				onClick={props.onClick}
				className={className}
				style={{paddingLeft: 12, paddingRight: 8}}
			>
				{label}
				{props.actions}
			</button>
		)
	}

	return (
		<div className={className} style={{paddingLeft: 12, paddingRight: 8}}>
			{label}
			{props.actions}
		</div>
	)
}
