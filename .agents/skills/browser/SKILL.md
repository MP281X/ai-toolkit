---
name: browser
description: 'Use for interacting with apps in a browser, UI/UX exploration or review, browser acceptance, screenshots, recordings, DOM or React DevTools inspection, and console, page-error, network, or performance evidence.'
---

Use `vpx agent-browser`; never load its bundled skills.

Use browser automation only for explicit browser work or final assurance; the user exercises planning prototypes manually.

Require the running origin, target flow, and expected state. Return `BLOCKED` with the missing input; never discover it here.

## Session

Create one isolated session; reuse its ID; store artifacts outside the repository; close only that session.

```bash
browser_session="$(vpx agent-browser session id --scope worktree --prefix browser)"
artifact_dir="$(mktemp -d)"
vpx agent-browser --session "$browser_session" open --enable react-devtools "$origin"
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

For UI acceptance, exercise the complete affected flow visually and behaviorally at desktop and mobile viewports. Retain final state and screenshots. Inspect page errors, console, and relevant requests; inspect React renders or performance only when material. Record only material motion or sequence. Accessibility and tracing are not dedicated targets.

```bash
vpx agent-browser --session "$browser_session" set viewport 1440 900
# complete affected flow
vpx agent-browser --session "$browser_session" set viewport 390 844 3
# complete affected flow
vpx agent-browser --session "$browser_session" screenshot --full "$artifact_dir/final.png"
vpx agent-browser --session "$browser_session" errors
vpx agent-browser --session "$browser_session" console
vpx agent-browser --session "$browser_session" network requests --type xhr,fetch
```

Use `set device <name>` only when named device emulation is material.

```bash
vpx agent-browser --session "$browser_session" vitals --json
vpx agent-browser --session "$browser_session" trace start
# exact interaction
vpx agent-browser --session "$browser_session" trace stop "$artifact_dir/trace.json"
vpx agent-browser --session "$browser_session" profiler start
# exact interaction
vpx agent-browser --session "$browser_session" profiler stop "$artifact_dir/profile.json"
```

```bash
vpx agent-browser --session "$browser_session" record start "$artifact_dir/flow.webm"
# exact interaction
vpx agent-browser --session "$browser_session" record stop
```

Report only expected state → observed state and material artifact paths. Keep credentials out of commands and output.

```bash
vpx agent-browser --session "$browser_session" close
```
