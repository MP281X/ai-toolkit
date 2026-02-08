import {Github} from '@ai-toolkit/components/icons'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {OAuth} from '@ai-toolkit/oauth/client'
import {useAtomSet} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'

import {AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/auth/')({
	component: RouteComponent
})

const signInAtom = AtomRuntime.fn(() => OAuth.signIn)

function RouteComponent() {
	const signIn = useAtomSet(signInAtom, {mode: 'promise'})

	return (
		<div className="flex h-svh w-full items-center justify-center">
			<Card className="w-full max-w-sm">
				<CardHeader className="text-center">
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Continue with GitHub to access your account</CardDescription>
				</CardHeader>
				<CardContent>
					<Button className="w-full" onClick={() => signIn()}>
						<Github className="size-4" />
						Continue with GitHub
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
