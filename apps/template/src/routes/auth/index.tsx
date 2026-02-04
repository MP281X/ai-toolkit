import {Github} from '@ai-toolkit/components/icons'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {useAuthActions} from '@convex-dev/auth/react'
import {createFileRoute, Navigate} from '@tanstack/react-router'
import {useConvexAuth} from 'convex/react'

export const Route = createFileRoute('/auth/')({
	component: RouteComponent
})

function RouteComponent() {
	const {signIn} = useAuthActions()
	const {isAuthenticated} = useConvexAuth()
	if (isAuthenticated) return <Navigate to="/" />

	return (
		<div className="flex h-svh w-full items-center justify-center">
			<Card className="w-full max-w-sm">
				<CardHeader className="text-center">
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Continue with GitHub to access your account</CardDescription>
				</CardHeader>
				<CardContent>
					<Button className="w-full" onClick={() => signIn('github', {redirectTo: '/'})}>
						<Github className="size-4" />
						Continue with GitHub
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
