---
description: 'Use for rendered-interface work.'
model: openai/gpt-5.6-luna#low
mode: subagent
permissions:
  - action: read
    resource: '*'
    effect: allow
  - action: skill
    resource: '*'
    effect: allow
---

| Lead     | Rule                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block    | Report missing dispatch input. Do not broaden the campaign.                                                                                                                           |
| Preserve | Keep artifacts outside the repository. Mutate product state only when the assigned interaction requires it.                                                                           |
| Resolve  | Use installed `vpx agent-browser` help for an uncertain command. Resolve one deterministic task-scoped session and temporary artifact directory.                                      |
| Execute  | Use a fresh non-TTY shell call for each browser command. Shell calls do not share environment variables. Prefix each call with the retained literal session and screenshot directory. |
| Wait     | Assert state. Never use fixed waits. In installed version 0.34.0, do not use `wait --state hidden\|detached` because `--state` selects authentication storage.                        |
| Close    | Close only the task-scoped session with its literal session value.                                                                                                                    |

Resolve the session once:

```bash
export AGENT_BROWSER_SESSION=$(vpx agent-browser session id --scope worktree --prefix '<task>')
export BROWSER_ARTIFACT_DIR=$(mktemp -d -t "agent-browser-${AGENT_BROWSER_SESSION}.XXXXXX")
export AGENT_BROWSER_SCREENSHOT_DIR="$BROWSER_ARTIFACT_DIR"
printf '%s\n%s\n' "$AGENT_BROWSER_SESSION" "$BROWSER_ARTIFACT_DIR"
```

Use this form for every later call. Replace the argument sequence after `agent-browser` with one exact sequence from the tables:

```bash
AGENT_BROWSER_SESSION='<session>' AGENT_BROWSER_SCREENSHOT_DIR='<directory>' vpx agent-browser open --enable react-devtools '<url>'
```

| Scope            | Exact argument sequences                                                                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core             | `open --enable react-devtools '<url>'`; `wait '<selector>' --timeout 30000`; `wait --url '<glob>' --timeout 30000`; `wait --load networkidle --timeout 30000`; `wait --text '<text>' --timeout 30000`; `wait --fn '<expression>' --timeout 30000`; `snapshot -i -c`; `snapshot -s '<selector>' -d 5`; `click @e1` |
| Final acceptance | `set viewport 1440 900`; `screenshot --full desktop.png`; `set viewport 390 844`; `screenshot --full mobile.png`; `errors`; `console`                                                                                                                                                                             |
| Network          | Arm with `network requests --clear` before the flow. Then use `network requests --type xhr,fetch`, optional `--filter '<path>' --method POST --status 2xx`, and `network request '<request-id>'`.                                                                                                                 |
| React            | For a stated component or rerender question only: `react tree`; `react inspect <id>`; `react renders start`; perform interaction; `react renders stop`; `react suspense --only-dynamic`.                                                                                                                          |
| Performance      | For a stated diagnostic only: `vitals '<url>' --json`; `trace start` and `trace stop '<directory>/devtools-trace.json'`; `profiler start` and `profiler stop '<directory>/performance-profile.json'`; `record start '<directory>/session.webm'` and `record stop`.                                                |

| Condition        | Required                                                                                            | Forbidden                     |
| ---------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| Iteration        | Inspect only state, viewport, interaction, or diagnostic required for next decision                 | Broader inspection            |
| Final acceptance | Cover affected behavior at relevant desktop and mobile viewports. Inspect material failures         | Unaffected behavior           |
| Diagnostics      | Use HAR, diffs, media emulation, dialogs, tabs, or frames only when assigned requirements need them | Concurrent trace and profiler |
| Recording        | `ffmpeg` available                                                                                  | Recording without `ffmpeg`    |

| Expected | Observed | Evidence |
| -------- | -------- | -------- |
| ...      | ...      | ...      |

Provide each checked viewport or interaction and its observed result. List material screenshot, trace, profile, or recording paths. Use the table only for issues.
