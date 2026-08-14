# Codex

| Authority                      | Source                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| Prompting                      | https://developers.openai.com/codex/prompting.md                            |
| Repository instructions        | https://learn.chatgpt.com/docs/agent-configuration/agents-md.md             |
| Skills                         | https://developers.openai.com/codex/skills.md                               |
| Subagents                      | https://developers.openai.com/codex/subagents.md                            |
| Configuration                  | https://developers.openai.com/codex/config-reference.md                     |
| Project/native agent discovery | `.agents/repos/codex/codex-rs/core/src/config/agent_roles.rs`               |
| Agent configuration schema     | `.agents/repos/codex/codex-rs/config/src/config_toml.rs`                    |
| Spawn tool schema              | `.agents/repos/codex/codex-rs/core/src/tools/handlers/multi_agents_spec.rs` |
| Agent runtime                  | `.agents/repos/codex/codex-rs/core/src/agent/role.rs`                       |

Open every applicable source directly and completely once. Use installed CLI help for the installed command interface.

Project and global Codex configuration belong to configuration policy. A task about that policy does not authorize mutation of external or global state.
