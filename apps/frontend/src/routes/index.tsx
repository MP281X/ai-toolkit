import { Markdown } from '@ai-toolkit/components/ai/markdown'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: RouteComponent })

function RouteComponent() {
	const md = `# Simulated LLM Response

This is a large placeholder markdown meant to exercise the markdown renderer. It demonstrates headers, emphasis, code, tables, lists, blockquotes, images, links, and other common Markdown features.

---

## Highlights

- **Bold text** and *italic text* and ~~strikethrough~~.
- Inline code: \`const x = 42\` and a shell example: \`npm run build\`.

### Code block (TypeScript)

\`\`\`ts
function greet(name: string) {
  return \`Hello, \${name}!\`
}
console.log(greet('world'))
\`\`\`

### Table

| Feature | Example |
| --- | --- |
| Link | [Example](https://example.com) |
| Image | ![placeholder](https://via.placeholder.com/120) |
| Code block | See the TypeScript block above |

### Lists

1. First ordered item
2. Second ordered item
   - Nested bullet
   - Another nested bullet

- Unordered item A
- Unordered item B

### Task List

- [x] Completed task
- [ ] Incomplete task

> This is a blockquote. It can contain *emphasis*, **strong**, and other inline elements.

---

### Link and reference

See the [MDN Web Docs](https://developer.mozilla.org/) for more examples.

---

### Horizontal rule above and an image below

---

![demo image](https://via.placeholder.com/600x120.png?text=Simulated+LLM+Image)

### Inline HTML (allowed by parser)

<details>
<summary>Click to expand</summary>

This is an HTML details block included to test raw HTML passthrough.

</details>

---

### Final note

This simulated output tries to include every common Markdown feature so the UI can be visually verified.
`

	return (
		<div className="p-6">
			<Markdown className="max-w-none" children={md} />
		</div>
	)
}
