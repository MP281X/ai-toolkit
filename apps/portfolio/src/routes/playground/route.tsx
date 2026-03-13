import {String} from 'effect'

import {MessageSquare, Paperclip} from '@ai-toolkit/components/icons'
import {TreeExplorer, TreeExplorerItem, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {createFileRoute, Outlet, useLocation, useNavigate} from '@tanstack/react-router'

import type {FileRouteTypes} from '../../routeTree.gen.ts'

export const Route = createFileRoute('/playground')({
	component: Layout
})

function Layout() {
	const navigate = useNavigate()
	const location = useLocation()

	function isCurrentPage(path: FileRouteTypes['to']) {
		return String.startsWith(path)(location.pathname)
	}

	return (
		<ResizablePanelGroup orientation="horizontal" className="h-full w-full">
			<ResizablePanel defaultSize="10%" minSize="5%" maxSize="20%" className="border-r">
				<TreeExplorer className="h-full">
					<TreeExplorerSection label="Pages" className="px-2 pt-2">
						<TreeExplorerItem
							onClick={() => navigate({to: '/playground/chat'})}
							selected={isCurrentPage('/playground/chat')}
							icon={<MessageSquare className="size-3.5" />}
						>
							Chat
						</TreeExplorerItem>
						<TreeExplorerItem
							onClick={() => navigate({to: '/playground/input'})}
							selected={isCurrentPage('/playground/input')}
							icon={<Paperclip className="size-3.5" />}
						>
							Input
						</TreeExplorerItem>
					</TreeExplorerSection>
				</TreeExplorer>
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel className="flex h-full flex-1">
				<Outlet />
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}
