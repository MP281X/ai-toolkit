---
name: ai
description: Load when integrating AI models — structured generation, tool definitions, toolkits, prompts, MCP schemas.
metadata:
  patterns: |
    LanguageModel.generateObject, Tool.make, Toolkit.make,
    Prompt.make, Prompt.concat, Response., McpSchema.,
    AnthropicStructuredOutput, OpenAiStructuredOutput, OpenRouterLanguageModel
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/ai/LanguageModel.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Tool.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Toolkit.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Prompt.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/Response.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/McpSchema.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/AnthropicStructuredOutput.ts
.opencode/resources/effect/packages/effect/src/unstable/ai/OpenAiStructuredOutput.ts
.opencode/resources/effect/packages/ai/openrouter/src/OpenRouterLanguageModel.ts
```

## Key patterns

- Structured output → `LanguageModel.ts`: `LanguageModel.generateObject`
- Provider limits → `AnthropicStructuredOutput.ts`, `OpenAiStructuredOutput.ts`
- Tools → `Tool.ts`: `Tool.make`, `Tool.dynamic`
- Toolkits → `Toolkit.ts`: `Toolkit.make`, `Toolkit.merge`
- Prompt and response boundaries → `Prompt.ts`, `Response.ts`
- MCP schemas → `McpSchema.ts`
- Schema design is the center of AI integration. Prefer structured outputs over JSON prompting.
- If a schema works in Effect and fails at the provider, inspect the provider-specific files before changing the schema.
