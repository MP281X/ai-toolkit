---
name: browser
description: 'Use for product exploration, UI prototyping, rendered acceptance or review, screenshots, recordings, console, or network evidence.'
---

Use `vpx agent-browser`; never load its bundled skills.

## Session

Create one isolated session; reuse its ID; store artifacts outside the repository; close only that session.

```bash
browser_session="$(vpx agent-browser session id --scope worktree --prefix browser)"
artifact_dir="$(mktemp -d)"
vpx agent-browser --session "$browser_session" --enable react-devtools open "$origin"
```

## Interaction

Snapshot before interaction. Use current snapshot refs; snapshot again after navigation or material change. Wait for asserted state, never fixed time.

```bash
vpx agent-browser --session "$browser_session" snapshot -i
vpx agent-browser --session "$browser_session" click @e2
vpx agent-browser --session "$browser_session" wait --text "Saved"
vpx agent-browser --session "$browser_session" snapshot -i
```

## React diagnosis

Use when component identity, rerenders, or suspense behavior is material.

```bash
vpx agent-browser --session "$browser_session" react tree
vpx agent-browser --session "$browser_session" react inspect <id>
vpx agent-browser --session "$browser_session" react renders start
# exact interaction
vpx agent-browser --session "$browser_session" react renders stop --json
vpx agent-browser --session "$browser_session" react suspense --only-dynamic --json
```

## Evidence

Retain final accessibility state and screenshot. Inspect page errors, console, and relevant requests. Record only material motion or sequence.

```bash
vpx agent-browser --session "$browser_session" screenshot --full "$artifact_dir/final.png"
vpx agent-browser --session "$browser_session" errors
vpx agent-browser --session "$browser_session" console
vpx agent-browser --session "$browser_session" network requests --type xhr,fetch
```

```bash
vpx agent-browser --session "$browser_session" record start "$artifact_dir/flow.webm"
# exact interaction
vpx agent-browser --session "$browser_session" record stop
```

Report scenario, expected state, observed state, and artifact paths. Keep credentials out of commands and output.

```bash
vpx agent-browser --session "$browser_session" close
```
