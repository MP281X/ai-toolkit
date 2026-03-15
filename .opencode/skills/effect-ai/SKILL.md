---
name: effect-ai
description: Effect AI models, tools, prompts, and structured output
metadata:
  patterns: LanguageModel.generateObject, Tool.make, Toolkit.make, Prompt.make, AnthropicStructuredOutput, OpenAiStructuredOutput, McpSchema
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/ai/LanguageModel.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Tool.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/AnthropicStructuredOutput.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/OpenAiStructuredOutput.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Toolkit.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Prompt.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Response.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/McpSchema.ts
```

## Purpose

- AI is schema-first: structured output, tools, and MCP all reuse Effect Schema patterns
- Start in `LanguageModel.ts`; the important decision is usually structured object generation, not free-form text
- Check `AnthropicStructuredOutput.ts` and `OpenAiStructuredOutput.ts` when a schema works in Effect but fails at the provider boundary
- Treat `Tool`, `Toolkit`, `Prompt`, `Response`, and `McpSchema` as separate boundaries and inspect the matching file before inventing a custom shape
- Treat Schema design as the center of the AI integration: provider limitations, tool input/output shapes, and structured generation all flow from it

## Where to look

- Schema-first outputs: `LanguageModel.generateObject`
- Provider-specific schema limits: `AnthropicStructuredOutput.ts`, `OpenAiStructuredOutput.ts`
- Schema adaptation rules and lossy conversions: `AnthropicStructuredOutput.ts`, `OpenAiStructuredOutput.ts`
- Tool definitions: `Tool.make`, `Tool.dynamic`
- Tool collections: `Toolkit.make`, `Toolkit.merge`
- Prompt / response boundaries: `Prompt.ts`, `Response.ts`
- MCP-ready schemas and RPCs: `McpSchema.ts`

## Best practices

- Prefer structured outputs with Schema over prompting for free-form JSON and parsing it later
- Define tools and toolkits explicitly instead of passing loose model-facing objects around
- Reuse `McpSchema` when the problem is MCP-shaped instead of inventing parallel protocol models
