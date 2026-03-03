import {MessageSquare, Repeat, Zap} from '@ai-toolkit/components/icons'
import {TreeExplorer, TreeExplorerItem, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {createFileRoute, Outlet, useLocation, useNavigate} from '@tanstack/react-router'

import type {FileRouteTypes} from '../../routeTree.gen.ts'

export const Route = createFileRoute('/(home)')({
	component: Layout
})

function Layout() {
	const navigate = useNavigate()

	const location = useLocation()
	const isCurrentPage = (path: FileRouteTypes['to']) => location.pathname.startsWith(path)

	return (
		<ResizablePanelGroup orientation="horizontal" className="h-full w-full">
			<ResizablePanel defaultSize="10%" minSize="5%" maxSize="20%" className="border-r">
				<TreeExplorer className="h-full">
					<TreeExplorerSection label="Pages" className="px-2 pt-2">
						<TreeExplorerItem
							onClick={() => navigate({to: '/chat'})}
							selected={isCurrentPage('/chat')}
							icon={<MessageSquare className="size-3.5" />}
						>
							Chat
						</TreeExplorerItem>
						<TreeExplorerItem
							onClick={() => navigate({to: '/diff'})}
							selected={isCurrentPage('/diff')}
							icon={<Repeat className="size-3.5" />}
						>
							Diff
						</TreeExplorerItem>
						<TreeExplorerItem
							onClick={() => navigate({to: '/realtime'})}
							selected={isCurrentPage('/realtime')}
							icon={<Zap className="size-3.5" />}
						>
							Realtime
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
