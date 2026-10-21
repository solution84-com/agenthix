---
created: 2026-03-27
description: Removing MCP from the site and making ClaudeSDKRuntime the canonical execution path.
---

# ADR-0022: Remove MCP — ClaudeSDKRuntime is the Canonical Execution Path

**Status:** Accepted
**Deciders:** the maintainers
**Supersedes:** ADR-0015, ADR-0016, ADR-0018

## Context

The platform's original execution model used MCP as a bridge: HQ would write a task to Firestore, the Site's MCP server would surface it, and an *external* agent (Claude Code running in a developer's IDE) would pick it up, execute it in a local workspace, and report the result back.

This model was designed before `ClaudeSDKRuntime` existed. The intent was correct — give the agent access to a local workspace, tools, and filesystem — but the implementation was a workaround. Running agents externally via MCP created compounding problems:

- **Agent identity.** The external agent's identity belonged to the developer's IDE, not the platform. HQ could assign a task to "AgentA" but had no guarantee which Claude Code instance (or which human's machine) would pick it up.
- **Observability.** The Site had no visibility into what the external agent was doing. Transcripts, tool calls, and intermediate results were invisible.
- **Lifecycle ownership.** The Site could not retry, cancel, or supervise an agent it didn't run. Failure modes were opaque.
- **Operational complexity.** Developers had to keep their IDE open and connected for tasks to execute. This was not a production-viable model.

The underlying desire — an agent with full tool access, running in a workspace, able to read/write files, run commands, and call APIs — is satisfied entirely by `ClaudeSDKRuntime`. The Site spawns Claude as a managed subprocess, owns its full lifecycle, and captures the complete transcript. No external agent is needed.

---

## Decision

> ⚠️ **Points 1 and 3 no longer describe the system.** *(annotated 2026-08-21)* MCP returned to the Execution Site in a role neither this record nor `adr-0015` considered: not an inbound interface for external agents, but the **outbound tool surface the platform's own agent uses**, authorised per run and forwarding every data-touching call to hq. **The decision this record holds is unchanged** — MCP as a third-party inbound interface stayed removed, and points 2 and 4–7 hold. What the current surface is, and why it is shaped that way, is described in [`docs/architecture/mcp/tools.md`](../architecture/mcp/tools.md).
>
> **Everything else here stands.** External agents still do not connect to a Site (2); the Connector model is still gone (4); `mcpEndpointUrl` still appears nowhere (5); the Cloud/Workdesk distinction (6) and the Fleet Registry (7) were never built. **`ClaudeSDKRuntime` is still the canonical execution path** — the headline claim of this record is intact.
>
> Point 3 is only partly reversed: the site holds no static MCP credential, but hq mints an `MCP` site secret for its own management endpoint. *(annotated 2026-08-21)*

**MCP is removed from the Site. `ClaudeSDKRuntime` is the canonical execution path.**

Specifically:

1. The Site no longer runs an MCP server for task execution.
2. External agents (Claude Code, Antigravity, or any MCP client) no longer connect to the Site to execute tasks.
3. The `conn_` / `mcp_` key concept is removed. There is no Site MCP credential.
4. The Connector identity model (ADR-0016) is removed in its entirety.
5. `mcpEndpointUrl` is removed from the `verify-key` handshake. Sites no longer register a public MCP endpoint with HQ.
6. The Cloud Site / Workdesk Site distinction — which was based entirely on MCP reachability — is removed.
7. The Fleet Registry (world-readable Firestore collection for MCP endpoint discovery) is not built.

The execution pipeline is:

```
HQ writes task (claimStatus = available)
  → Firestore onSnapshot fires on Site
    → fetchTasks() Cloud Function atomically claims it
      → dispatchHqTask() creates AgentSession + AgentRun
        → AgentEngine → ClaudeSDKRuntime subprocess
          → completeTaskOnHq() writes result back to HQ
```

The Site is the agent. It does not delegate to external systems.

---

## On MCP's future role

> ⚠️ **This section predicted the wrong return.** MCP did come back, but first as the Site-served agent tool surface described in [`docs/architecture/mcp/tools.md`](../architecture/mcp/tools.md) — the case below treats as impossible. The HQ management interface it does anticipate was *also* built, and is undescribed. *(annotated 2026-08-21)*

MCP is not gone from the platform forever. Its future role is different from what ADR-0015 described:

- **Not:** an execution interface for external agents connecting to Sites
- **Possibly:** a developer-facing management interface on HQ — letting a developer's IDE agent query tasks, check status, or create work items without leaving the IDE

This is a future decision. It would be an HQ MCP server, not a Site MCP server, and it would not be in the task execution path.

---

## Consequences

### Positive

- **Execution is fully owned by the Site.** Identity, lifecycle, observability, and retry are all under platform control.
- **No MCP server to operate or secure on the Site.** No credential management, no session limits, no `mcp_` key rotation.
- **Simpler provisioning.** `verify-key` is a pure auth handshake — no endpoint registration, no site type determination.
- **Simpler identity model.** Sites and Connectors were separate provisioned identities. Now there is only one identity: the Site.
- **Sub-second task execution.** The Firestore listener replaces both the MCP polling loop and the HTTP polling fallback.

### Negative / trade-offs

- **Developer cannot use their own IDE agent to execute tasks on the platform.** The workaround is gone; the proper solution (HQ MCP for management, not execution) is future scope.
- **MCP server code in the Site codebase is dead code** until removed. Tracked as a cleanup task.

---

## Superseded ADRs

| ADR | Title | Status |
|---|---|---|
| ADR-0015 | MCP agent connections at the Site | Superseded — MCP removed from Site |
| ADR-0016 | Sites and Connectors as separate identities | Superseded — Connector concept removed |
| ADR-0018 | MCP key as a Site credential | Superseded — `mcp_` key removed with MCP |

---

## Related

- [ADR-0017 — Agent Execution is a Site Concern](./adr-0017-agent-execution-as-site-concern.md) — established the Site as the execution plane; this ADR completes that intent
- [ADR-0019 — Agent Runtime Abstraction](./adr-0019-agent-runtime-abstraction.md) — `ClaudeSDKRuntime` is the runtime this ADR designates as canonical
