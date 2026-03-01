import {Predicate} from 'effect'

import {type ToolApprovalRequestPart, ToolApprovalResponsePart, type ToolMessagePart} from '@ai-toolkit/ai/schema'
import {HelpCircleIcon} from 'lucide-react'
import {useState} from 'react'

import {Badge} from '#components/ui/badge.tsx'
import {Button} from '#components/ui/button.tsx'

export function ToolApproval(props: {part: ToolApprovalRequestPart; onResponse?: (response: ToolMessagePart) => void}) {
	const [responded, setResponded] = useState<boolean>()

	function respond(approved: boolean) {
		setResponded(approved)
		props.onResponse?.(new ToolApprovalResponsePart({approvalId: props.part.approvalId, approved}))
	}

	return (
		<div className="flex items-center gap-1.5 border border-border bg-muted/40 px-3 py-1.5 text-[11px] uppercase leading-none tracking-wide">
			<HelpCircleIcon className="size-3 text-muted-foreground" />
			<span className="text-foreground">approval required</span>
			<div className="ml-auto flex items-center gap-2">
				{Predicate.isUndefined(responded) ? (
					<>
						<Button size="xs" variant="outline" onClick={() => respond(true)}>
							allow
						</Button>
						<Button
							size="xs"
							variant="outline"
							className="border-destructive/50 text-destructive hover:bg-destructive/10"
							onClick={() => respond(false)}
						>
							deny
						</Button>
					</>
				) : (
					<Badge variant={responded ? 'default' : 'destructive'}>{responded ? 'allowed' : 'denied'}</Badge>
				)}
			</div>
		</div>
	)
}
