# Agent Orchestrator

## Problem

AI agents fail on complex multi-step workflows:
- Break early on loops (most critical failure mode)
- No control over conversation context between steps
- Context pollution — irrelevant history accumulates and degrades quality
- No way to fork/merge conversations without manual copy-paste
- No systematic way to test and improve prompts

## Solution

An agent orchestrator with 4 pillars:

### 1. Workflow Engine (State Machine)

```
states: plan → implement → test
         ↑                   │
         └───── fail ────────┘
```

- Workflows are **state machines**: named states with transitions
- **Engine controls loops**, not the agent — agent cannot break early
- Human can override/intervene at any iteration
- Supports: conditional branching, parallel execution, looping, human gates
- AI generates workflow definitions via conversation (asks questions, sketches, iterates with user)
- Definitions are **versionable structured data**
- Mermaid diagram visualization

#### Step Definition

Each step has:
- Name
- System prompt
- Input schema
- Output schema
- Available tools
- Which agent to use
- Transition rules (conditions on output → next state)

#### Control Flow Primitives

- **Sequence**: A → B → C
- **Condition**: if output matches X → go to A, else → go to B
- **Loop**: repeat step until engine-controlled condition (human can override)
- **Parallel**: run same step with multiple agents, collect results
- **Human gate**: pause and wait for user input before continuing
- **Fork/join**: branch into parallel paths, merge results

### 2. Context Tree (Git-like Conversation History)

```
main:  [msg1] → [msg2] → [msg3] → [msg4] → [merged-result]
                    ↓                              ↑
branch:          [msg2] → [explore1] → [explore2] ─┘ (squash merge)

throwaway:                 [msg3] → [question] → [answer]  (never merged, kept for history)
```

- Conversation stored as a **tree**, not a linear list
- **Fork**: branch from any point to explore without polluting main context
- **Merge**: squash back only what matters — configurable per merge:
  - Summary only
  - Last message only
  - Summary + last message
  - Full history
  - Custom summary (AI-generated based on history + user guidance on what to keep)
- **Fork + discard**: side exploration that never merges back (kept for history)
- **Fork from specific message**: restart from a particular point
- Each workflow step gets **precisely the context it needs**, nothing more
- Visual graph showing branch points and all branches

### 3. Agent Abstraction

```
┌─────────────────────────────────────────┐
│           Standard Interface            │
│  input: context + system prompt         │
│  output: structured result + history    │
├─────────┬──────────┬──────────┬─────────┤
│ Custom  │ Claude   │ OpenCode │ Codex   │
│ Agent   │ Code     │          │         │
└─────────┴──────────┴──────────┴─────────┘
```

- Standard interface over LLM backends
- **MVP: custom agent only** (built on existing Effect AI abstractions)
- Other adapters (Claude Code, OpenCode, Codex) added later
- Black box: takes input, produces output (internal tool calls are opaque)
- Can transfer conversation history between different agents
- Each agent can have different tools available

### 4. Eval Framework

```
workflow run → step fails → inspect history → edit prompt → rerun step → compare
```

- Full conversation history for every workflow execution
- Inspect what happened at each step
- When something goes wrong:
  1. Select the problematic step
  2. View the conversation history + system prompt used
  3. Have AI analyze and suggest prompt improvements
  4. Edit the system prompt
  5. Rerun just that step with the same input
  6. Compare original vs improved output
- A/B testing: run same step with different prompts/models, compare side by side
- All eval runs are persisted for reference

## UI

### 3 Views

1. **Design View** — workflow graph (mermaid) + step editor
   - Visual state machine editor
   - Edit step properties (system prompt, tools, agent, schemas)
   - AI-assisted workflow creation via conversation

2. **Run View** — live execution with conversation tree
   - See workflow progress on the graph (which state is active)
   - Stream conversation happening at each step
   - Fork/merge visualization
   - Human intervention points (answer questions, override loops)

3. **Eval View** — prompt testing and comparison
   - Step history inspection
   - Prompt editor
   - Side-by-side comparison
   - AI-assisted prompt improvement

### UI Details (to iterate on)
- Mermaid diagrams for workflow visualization
- Conversation streaming (existing components)
- Tree explorer for context branches

## Architecture

### Packages

- `packages/workflow` — core types, state machine engine, context tree
- `packages/ai` — agent abstraction (refactor existing)
- `apps/agent` — replaced completely with orchestrator app

### Persistence

- Effect KeyValueStore with FS layer
- Persist: workflow definitions, conversation trees, execution history, eval results
- Execution state: in-memory (can be reconstructed from history)

### Tech Stack

- TypeScript + Bun + Effect
- React 19 + TanStack Router + Vite + Tailwind
- Existing monorepo structure

## Implementation Order

### Phase 1: Foundation
1. `packages/workflow` — core types (State, Transition, Workflow, Step schemas)
2. Agent abstraction — standard interface in `packages/ai`
3. Context tree — data structure + fork/merge operations
4. State machine engine — workflow execution

### Phase 2: App
5. Persistence — KV store integration
6. Orchestrator app — replace `apps/agent`
   - Design view (mermaid + step config)
   - Run view (execution + conversation streaming)
   - RPC layer

### Phase 3: Intelligence
7. AI workflow generation — conversational workflow builder
8. Eval framework — prompt testing + improvement

## Runtime

- Backend + web UI
- Local first (CLI/desktop app), cloud-deployable later
- Multiple workflows can run in parallel
- No auth for now (single user)
