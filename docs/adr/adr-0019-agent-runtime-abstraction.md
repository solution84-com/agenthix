---
created: 2026-03-26
description: A thin AgentRuntime interface at the site, implemented for the native engine and the Claude Agent SDK.
---

# ADR-0019: Agent Runtime Abstraction and Claude Agent SDK Integration

**Status:** Accepted

## Context

The Site currently runs all agents through a single native runtime built on the Vercel AI SDK (`AgentEngine.ts`). This runtime manages the agentic loop, tool execution, transcript persistence, and WebSocket streaming manually.

Two pressures prompted this decision:

1. **Capability gap** — the native runtime requires significant ongoing work to match the tool use, session management, and error recovery behaviour of mature agent runtimes.
2. **Vendor flexibility** — the native runtime's multi-provider support (Anthropic, OpenAI, OpenRouter) is a strategic asset worth preserving. Replacing it entirely with a single-vendor SDK would sacrifice this.

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) provides a fully-formed agent runtime — built-in file system tools, shell execution, session management, permission controls, and subagent support — at the cost of Anthropic-only execution.

## Decision

Introduce a thin `AgentRuntime` interface at the Site and implement it for both the existing native engine and the Claude Agent SDK.

**The interface captures only what the caller needs:**

```typescript
interface AgentRuntime {
  run(context: RunContext): AsyncIterable<RunEvent>
}
```

Shared concerns — transcript persistence, WebSocket streaming, error handling — live above the interface and are runtime-agnostic.

**Agents are configured with a `runtime` field** (`"native"` | `"claude-sdk"`). The default is `"native"`. The Claude Agent SDK runtime is opt-in.

**The Claude Agent SDK integration serves two purposes:**

1. An immediately usable, capable runtime for tasks that benefit from it (file system access, shell execution, autonomous tool use).
2. A reference implementation — by running both runtimes against the same tasks, the team can observe what the Agent SDK does well and replicate those patterns in the native runtime over time.

**Authentication** uses `ANTHROPIC_API_KEY` from the server environment. The Agent SDK is invoked server-side within the existing Wasp Node.js process.

**Workspace alignment** — the Agent SDK's `cwd` is set to the agent's existing workspace directory, meaning VSCode and the server-side SDK instance share the same filesystem state. This enables real-time inspection of agent work from the IDE.

## Consequences

- Both runtimes coexist. No forced migration.
- The native runtime retains multi-provider support and remains the default.
- The Agent SDK runtime is available for agents that need its capabilities.
- Comparing runtime outputs on the same tasks creates a feedback loop for native runtime improvement.
- Vendor lock-in is avoided: the Agent SDK is one implementation behind an interface, not a platform dependency.
- The `claude` CLI must be installed and authenticated on the machine running the Site.

## Alternatives considered

**Replace the native runtime entirely with the Agent SDK.**
Rejected — locks the platform to Anthropic and eliminates multi-provider support, which is a core differentiator.

**Integrate without an abstraction layer (separate code paths, no interface).**
Rejected — shared concerns (transcript, streaming) would be duplicated, and the comparison loop that informs native runtime development would be harder to operate.

**Integrate as a special built-in agent type only.**
Rejected — limits the integration to a single agent and doesn't scale to the goal of making runtime choice per-agent configurable.

## Related

- [ADR-0017 — Agent Execution is a Site Concern](./adr-0017-agent-execution-as-site-concern.md) — Sites own execution; this ADR defines how that execution is structured internally.
- [ADR-0009 — Fast-Track Agent Engine](./adr-0009-fast-track-engine.md) — the existing native runtime this abstraction wraps.
