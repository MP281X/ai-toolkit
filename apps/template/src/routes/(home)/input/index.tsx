import {Array} from 'effect'

import {AtSign, Code, CodeXml, Sparkles, X} from '@ai-toolkit/components/icons'
import {
	Autocomplete,
	AutocompleteOption,
	ChatInput,
	InputActions,
	Snippet,
	Snippets,
	Toolbar
} from '@ai-toolkit/components/input'
import {Button} from '@ai-toolkit/components/ui/button'
import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'

export const Route = createFileRoute('/(home)/input/')({
	component: RouteComponent
})

function RouteComponent() {
	const [value, setValue] = useState('')
	const [submitted, setSubmitted] = useState(JSON.stringify({text: '', completions: [], attachments: []}, null, 2))

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex min-h-0 flex-1 items-center justify-center p-8">
				<pre className="max-h-full w-[70%] overflow-auto rounded border border-input bg-muted/30 p-6 font-mono text-xs leading-6">
					{submitted}
				</pre>
			</div>

			<ChatInput
				value={value}
				onValueChange={setValue}
				onSubmit={data => {
					setSubmitted(
						JSON.stringify(
							{
								text: data.text,
								completions: data.completions,
								attachments: Array.map(data.attachments, file => ({
									name: file.name,
									type: file.type,
									size: file.size,
									lastModified: file.lastModified
								}))
							},
							null,
							2
						)
					)
					setValue('')
				}}
				placeholder="Type @ for mentions, / for commands, use snippets, or attach files..."
			>
				<Toolbar>
					<span className="text-[11px] text-muted-foreground">@ mentions · / commands · snippets · attachments</span>
				</Toolbar>

				<Snippets>
					<Snippet insert={'```ts\n\n```\n'}>
						<Code className="size-3.5" />
					</Snippet>
					<Snippet insert={'<div>\n\n</div>\n'}>
						<CodeXml className="size-3.5" />
					</Snippet>
				</Snippets>

				<Autocomplete trigger="@" color="#60a5fa">
					<AutocompleteOption value="alex" icon={<AtSign className="size-3.5" />} />
					<AutocompleteOption value="jamie" icon={<AtSign className="size-3.5" />} />
					<AutocompleteOption value="morgan" icon={<AtSign className="size-3.5" />} />
				</Autocomplete>

				<Autocomplete trigger="/" color="#34d399">
					<AutocompleteOption value="summarize" icon={<Sparkles className="size-3.5" />} />
					<AutocompleteOption value="rewrite" icon={<Sparkles className="size-3.5" />} />
					<AutocompleteOption value="checklist" icon={<Sparkles className="size-3.5" />} />
				</Autocomplete>

				<InputActions>
					<Button type="button" variant="outline" size="icon-xs" onClick={() => setValue('')} aria-label="Clear">
						<X className="size-3.5" />
					</Button>
				</InputActions>
			</ChatInput>
		</div>
	)
}
