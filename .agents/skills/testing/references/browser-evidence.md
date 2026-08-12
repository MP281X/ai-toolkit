# Browser evidence

Use an attached product-native browser when available. Otherwise load the installed browser contract before commands:

```bash
vpx agent-browser skills get core --full
```

Source: `.agents/repos/agent-browser/AGENTS.md` and `.agents/repos/agent-browser/skill-data/core/SKILL.md`.

```text
allocate isolated worktree session
open supplied origin
snapshot interactive state
perform exact interaction
wait for observable state
capture final snapshot and screenshot
inspect errors, console, and relevant network request
close owned session
```

Use locators from the latest snapshot. Re-snapshot after navigation or UI changes. Keep credentials out of commands and output; store disposable artifacts outside the repository.
