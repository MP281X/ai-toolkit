import { useAtomSuspense } from '@effect-atom/atom-react'
import { createFileRoute } from '@tanstack/react-router'
import { Random } from 'effect'
import { AtomRuntime } from '#lib/runtime.ts'

export const Route = createFileRoute('/')({ component: RouteComponent })

const RandomNumAtom = AtomRuntime.atom(Random.nextIntBetween(0, 100))

function RouteComponent() {
	const { value } = useAtomSuspense(RandomNumAtom)

	return <div>{value}</div>
}
