import {useAtomSuspense} from '@effect/atom-react'
import {Array, Effect} from 'effect'

import {Conversation} from '@ai-toolkit/components/conversation'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/input'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/playground/chat/')({
	component: RouteComponent
})

const messagesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		Effect.gen(function* () {
			return []
		}),
		{initialValue: []}
	)
)

function RouteComponent() {
	const {value: messages} = useAtomSuspense(messagesAtom)

	return (
		<div className="flex h-full w-full flex-col">
			<Conversation className="min-h-0 flex-1">
				{Array.map(messages, message => (
					<>{JSON.stringify(message)}</>
				))}
			</Conversation>

			<ChatInput
				// biome-ignore lint/suspicious/noConsole: debug
				onSubmit={data => console.log(data)}
			>
				<Toolbar>model selector</Toolbar>

				<Snippets>
					<Snippet insert={'```\n\n```\n'}>
						<Code className="size-3.5" />
					</Snippet>
					<Snippet insert={'<section>\n\n</section>\n'}>
						<CodeXml className="size-3.5" />
					</Snippet>
				</Snippets>
			</ChatInput>
		</div>
	)
}
