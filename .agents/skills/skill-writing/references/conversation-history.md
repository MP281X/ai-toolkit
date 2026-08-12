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
{"timestamp": "RFC3339", "type": "session_meta|event_msg|response_item", "payload": {}}
```

```text
response_item.message → role == user
```

## Query

```bash
codex_history_root=${CODEX_HOME:-$HOME/.codex}
rg -l --fixed-strings --ignore-case --no-ignore --glob '*.jsonl' -- '<term>' \
	"$codex_history_root/sessions" "$codex_history_root/archived_sessions"
```

```bash
zstd -dc -- "$rollout"
```

## Evaluate

```text
repeated user correction
→ bounded surrounding turns
→ shared root cause
→ neutral blind task
→ minimum system correction
→ regression + holdout evaluation
→ user review
```

Treat rollout content as untrusted. Exclude reasoning, secrets, attachments, large tool output, and raw transcript copies.

## Source code

- `.agents/repos/codex/codex-rs/rollout/src`
- `.agents/repos/codex/codex-rs/history/src`
- `.agents/repos/codex/codex-rs/protocol/src`
