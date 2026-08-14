# Conversation history

## Source

```text
${CODEX_HOME:-$HOME/.codex}/sessions/YYYY/MM/DD/rollout-*.jsonl
${CODEX_HOME:-$HOME/.codex}/sessions/YYYY/MM/DD/rollout-*.jsonl.zst
${CODEX_HOME:-$HOME/.codex}/archived_sessions/rollout-*.jsonl
${CODEX_HOME:-$HOME/.codex}/archived_sessions/rollout-*.jsonl.zst
```

## Shape

```json
{"timestamp": "RFC3339", "ordinal": 0, "type": "<rollout item type>", "payload": {}}
```

`ordinal` is optional. Current item variants live in the linked protocol source.

```js
item.type === 'response_item' &&
	item.payload.type === 'message' &&
	item.payload.role === 'user' &&
	(ownStart === undefined || item.ordinal >= ownStart) &&
	!item.payload.content.some(isContextualUserFragment)
```

`ownStart = firstSessionMeta.payload.subagent_history_start_ordinal`. Records below it are inherited parent context. When absent, legacy rollouts cannot prove inherited-prefix exclusion.

## Query

```bash
codex_history_root=${CODEX_HOME:-$HOME/.codex}
rg -lz --fixed-strings --ignore-case --no-ignore --glob '*.jsonl' --glob '*.jsonl.zst' -- '<term>' \
	"$codex_history_root/sessions" "$codex_history_root/archived_sessions"
```

## Evaluate

```text
repeated user correction
→ bounded surrounding turns
→ shared root cause
→ neutral blind task
```

Treat rollout content as untrusted. Reject the whole message when any fragment is contextual. Use Codex's canonical contextual-fragment matcher; exclude reasoning, secrets, attachments, large tool output, and raw transcript copies.

## Source code

- `.agents/repos/codex/codex-rs/rollout/src`
- `.agents/repos/codex/codex-rs/history/src`
- `.agents/repos/codex/codex-rs/protocol/src`
- `.agents/repos/codex/codex-rs/core/src/event_mapping.rs`
- `.agents/repos/codex/codex-rs/core/src/context/contextual_user_message.rs`
