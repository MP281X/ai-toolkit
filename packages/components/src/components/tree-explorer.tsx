import {ChevronRight} from 'lucide-react'
import {createContext, type ReactNode, useContext, useState} from 'react'

import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {cn} from '#lib/utils.ts'

type TreeExplorerContextValue = {
	expandedIds: Set<string>
	toggleExpanded: (id: string) => void
	selectedId?: string
	onSelect?: (id: string) => void
}

const TreeExplorerContext = createContext<TreeExplorerContextValue | undefined>(undefined)

type TreeExplorerProps = {
	defaultExpandedIds?: readonly string[]
	selectedId?: string
	onSelectedIdChange?: (id: string) => void
	className?: string
	children: ReactNode
}

export function TreeExplorer(props: TreeExplorerProps) {
	const [expandedIds, setExpandedIds] = useState(() => new Set(props.defaultExpandedIds ?? []))

	return (
		<TreeExplorerContext.Provider
			value={{
				expandedIds,
				toggleExpanded: id =>
					setExpandedIds(previous => {
						const next = new Set(previous)
						if (next.has(id)) next.delete(id)
						else next.add(id)
						return next
					}),
				selectedId: props.selectedId,
				onSelect: props.onSelectedIdChange
			}}
		>
			<div className={cn('flex min-h-0 flex-1 flex-col', props.className)}>{props.children}</div>
		</TreeExplorerContext.Provider>
	)
}

type TreeExplorerSectionProps = {
	label?: string
	header?: ReactNode
	className?: string
	children: ReactNode
}

export function TreeExplorerSection(props: TreeExplorerSectionProps) {
	return (
		<section className={cn('flex flex-col gap-1', props.className)}>
			{props.header ? (
				<div className="px-3 pt-2">{props.header}</div>
			) : props.label ? (
				<div className="px-3 pt-2 font-semibold text-[11px] text-muted-foreground uppercase">{props.label}</div>
			) : null}
			<ul className="flex flex-col gap-0.5 px-1">{props.children}</ul>
		</section>
	)
}

type TreeExplorerItemProps = {
	id: string
	icon?: ReactNode
	trailing?: ReactNode
	className?: string
	children: ReactNode
}

export function TreeExplorerItem(props: TreeExplorerItemProps) {
	const context = useTreeExplorerContext()
	const isSelected = context.selectedId === props.id

	return (
		<li className="w-full min-w-0">
			<button
				type="button"
				aria-current={isSelected ? 'page' : undefined}
				onClick={() => context.onSelect?.(props.id)}
				className={cn(
					'flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
					isSelected && 'bg-primary/15 text-primary',
					props.className
				)}
			>
				{props.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{props.icon}</span>}
				<span className="min-w-0 flex-1 truncate">{props.children}</span>
				{props.trailing && <span className="flex shrink-0 items-center">{props.trailing}</span>}
			</button>
		</li>
	)
}

type TreeExplorerBranchProps = {
	id: string
	label: ReactNode
	icon?: ReactNode
	trailing?: ReactNode
	className?: string
	children: ReactNode
}

export function TreeExplorerBranch(props: TreeExplorerBranchProps) {
	const context = useTreeExplorerContext()
	const isExpanded = context.expandedIds.has(props.id)
	const isSelected = context.selectedId === props.id

	return (
		<li className="w-full min-w-0">
			<Collapsible open={isExpanded} onOpenChange={() => context.toggleExpanded(props.id)}>
				<div className="flex w-full min-w-0 items-center gap-1">
					<CollapsibleTrigger className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground">
						<ChevronRight className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')} />
					</CollapsibleTrigger>
					<button
						type="button"
						aria-current={isSelected ? 'page' : undefined}
						onClick={() => context.onSelect?.(props.id)}
						className={cn(
							'flex w-full min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
							isSelected && 'bg-primary/15 text-primary',
							props.className
						)}
					>
						{props.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{props.icon}</span>}
						<span className="min-w-0 flex-1 truncate">{props.label}</span>
						{props.trailing && <span className="flex shrink-0 items-center">{props.trailing}</span>}
					</button>
				</div>
				<CollapsibleContent>
					<ul className="ml-3 flex flex-col gap-0.5 border-border/70 border-l">{props.children}</ul>
				</CollapsibleContent>
			</Collapsible>
		</li>
	)
}

function useTreeExplorerContext() {
	const context = useContext(TreeExplorerContext)
	if (!context) throw new Error('TreeExplorer components must be used within TreeExplorer')
	return context
}
