import {cn} from '#lib/utils.ts'

type TreeExplorerProps = {
	className?: string
	children: React.ReactNode
}

export function TreeExplorer(props: TreeExplorerProps) {
	return <div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
}

type TreeExplorerSectionProps = {
	label: React.ReactNode
	className?: string
	children: React.ReactNode
}

export function TreeExplorerSection(props: TreeExplorerSectionProps) {
	return (
		<section className={cn('flex flex-col gap-1.5', props.className)}>
			<div className="px-3 pt-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
				{props.label}
			</div>
			<ul className="flex flex-col gap-px px-1">{props.children}</ul>
		</section>
	)
}

type TreeExplorerItemProps = {
	selected?: boolean
	onClick?: () => void
	icon?: React.ReactNode
	depth?: number
	actions?: React.ReactNode
	variant?: 'item' | 'group'
	className?: string
	children: React.ReactNode
}

export function TreeExplorerRow(props: TreeExplorerItemProps) {
	const className = cn(
		'grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground',
		props.variant === 'group' && 'h-7 font-semibold text-foreground hover:bg-transparent',
		props.selected &&
			'bg-muted text-foreground shadow-[inset_1px_0_0_hsl(var(--primary))] hover:bg-muted hover:text-foreground',
		props.className
	)
	const style = {paddingLeft: 8 + (props.depth ?? 0) * 12, paddingRight: 8}
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

type TreeExplorerGroupProps = {
	label: React.ReactNode
	actions?: React.ReactNode
	icon?: React.ReactNode
	className?: string
	contentClassName?: string
	children: React.ReactNode
}

export function TreeExplorerGroup(props: TreeExplorerGroupProps) {
	return (
		<li className="min-w-0 py-1 first:pt-0">
			<TreeExplorerRow variant="group" icon={props.icon} actions={props.actions} className={props.contentClassName}>
				{props.label}
			</TreeExplorerRow>
			<ul
				className={cn('flex flex-col gap-px border-muted-foreground/20 border-l', props.className)}
				style={{marginLeft: 15}}
			>
				{props.children}
			</ul>
		</li>
	)
}
