---
name: agent-browser
description: 'Use for real-browser interaction and rendered evidence through the agent-browser CLI.'
---

Every command uses one owned named session:

```bash
vpx agent-browser --session <name> open <url>
vpx agent-browser --session <name> snapshot -i
vpx agent-browser --session <name> click @eN
vpx agent-browser --session <name> fill @eN "<text>"
vpx agent-browser --session <name> press Enter
```

Act only on current snapshot refs. Re-snapshot after every action and after navigation, rendering, dialog, tab, or frame changes.

Wait for observable state; use a fixed delay only when none exists:

```bash
vpx agent-browser --session <name> wait @eN
vpx agent-browser --session <name> wait --text "<text>"
vpx agent-browser --session <name> wait --url "<pattern>"
vpx agent-browser --session <name> wait --load networkidle
vpx agent-browser --session <name> wait --fn "<JavaScript condition>"
vpx agent-browser --session <name> wait <milliseconds>
```

Diagnostics, recording, and artifacts:

```bash
vpx agent-browser --session <name> console
vpx agent-browser --session <name> network requests
vpx agent-browser --session <name> network requests --filter <text>
vpx agent-browser --session <name> network request <requestId>
vpx agent-browser --session <name> screenshot
vpx agent-browser --session <name> screenshot <path>
vpx agent-browser --session <name> screenshot --full
vpx agent-browser --session <name> record start <path> [url]
vpx agent-browser --session <name> record stop
vpx agent-browser --session <name> close
```

Snapshots, console or network output, screenshots, and WebM recordings are the available evidence. Keep artifacts bounded in managed output or `/tmp`. Close only the owned session.
