---
created: 2026-03-23
description: Provisioning and managing every MCP agent connection at the Site rather than at HQ.
---

# MCP agent connections at the Site

**Status:** Superseded by adr-0022
**Deciders:** the maintainers
**Supersedes:** `20260323T103829-edge-mcp-site-routing.md`, `20260323T140000-mcp-site-execution-layer.md`

## Context

The platform has two tiers: **HQ** (the central registry and management plane) and **Sites** (execution environments owned by orgs). We needed to decide where MCP connections live — and how external agents are identified, authenticated, and routed to do work on behalf of an org.

In the v1 architecture, all external agent connections terminated at HQ's Express Thin Server, which held open persistent SSE connections and relayed tasks to the appropriate Site. This created a structural bottleneck and conflated HQ's coordination role with agent connection handling.

### Internal agents vs external agents

Two agent types operate in the platform:

- **Internal agents** are provisioned directly in HQ. Their identity is a Workspace (registered in HQ) and their execution location is the Site they are bound to.
- **External agents** are provisioned in HQ and connect to a Site via MCP. HQ routes tasks to them using their Site, MCP key, and Workspace — allowing the same MCP key to serve multiple agent instances across different workspaces.

```
HQ (coordination and provisioning plane)
├── Agent registry
└── Site registry

Site (execution and connection plane, owned by org)
├── Internal agent  (identified by: Site + Workspace)
└── MCP Server
    └── External agent  (identified by: Site + MCP key + Workspace)
```

The key insight: **HQ is the coordination and provisioning plane. The Site is the execution and connection plane.** Mixing agent connection handling into HQ conflates these responsibilities.

---

## Decision

**All MCP agent connections are provisioned and managed at the Site level, not HQ.**

Specifically:

1. The MCP SSE server lives on the Site backend (`:3002/mcp`), not on HQ. HQ is not in the agent communication path.
2. External agents authenticate with the Site using an **MCP key** provisioned by HQ. There is no per-agent key — a single MCP key can have multiple agents registered under it in HQ. Each agent instance is identified by Site + MCP key + Workspace, enabling routing across multiple workspaces using the same key.
3. Multiple external agents can connect to a Site's MCP server simultaneously using the same MCP key. The Site enforces a concurrent session limit.
4. Remote agents discover their Site's MCP endpoint via the Fleet Registry (Firestore) — a world-readable collection. Local agents on the same machine as a Workdesk Site are pre-configured with `localhost` and skip discovery.
5. **Agents poll for work — the Site does not push.** MCP is request-driven. Agents run a scheduled loop calling `get_next_task()`. The Site answers from its local Firestore-synced task state without a live Firestore read on each poll.
6. Task completion flows from the agent back to the Site via `submit_result()`. The Site writes the result to Firestore. HQ observes completion via the Firestore record.
7. Every org must have at least one active, reachable Site to accept external agent connections. HQ does not buffer or proxy on behalf of an offline Site.

The full bootup, registration, and agent session flows were specified in a separate site-connection-flows document, which no longer exists — it described the connector model this record proposed, and was removed with it. *(link corrected 2026-08-21)*

---

## Consequences

### Positive

- **Scalability by default.** Each Site hosts its own MCP server. Load distributes across Sites naturally. Adding capacity means adding a Site, not scaling a central server.
- **HQ is not in the agent communication path.** HQ handles only low-frequency provisioning operations. Per-message agent communication bypasses it entirely.
- **Stronger org isolation.** A Site's MCP endpoint only handles agents belonging to that Site. Cross-org agent access is impossible by construction.
- **Locality.** Agent execution, task queuing, and MCP communication all happen on the same process. No round-trip to HQ for task relay.
- **Zero secret sync.** There is no per-agent key. A single HQ-provisioned MCP key covers multiple agents, identified at routing time by Site + MCP key + Workspace.
- **Org governance at HQ, execution at the edge.** The org defines agent roles in HQ's registry; execution happens on infrastructure the org controls.

### Negative / trade-offs

- **Site availability is a hard dependency.** If a Site goes offline, its external agents become unreachable. HQ cannot compensate.
- **Every org needs at least one Site.** There is no fallback connection mode.
- **External agent Workspaces are not HQ-managed.** The Workspace in their identity (Site + MCP key + Workspace) is the external tool's location (e.g. working directory in Claude Code), not a persistent state stored in HQ.
- **Agent discovery adds a step for remote agents.** Remote agents must read the Fleet Registry before connecting. Local agents have no discovery step.
- **Polling latency.** Task dispatch latency is bounded by the agent's poll interval, not by network round-trip time.

---

## Alternatives considered

**MCP at HQ level:** Rejected — tightly couples all agent connections to the central registry, makes HQ a TCP bottleneck, and limits per-site flexibility.

**Per-agent MCP key:** Rejected — a key per agent introduces a secret-sync problem at scale and complicates provisioning. Instead, a single MCP key covers multiple agents, with workspace location used for routing disambiguation.

**One MCP connection per external agent:** Rejected — a single MCP server supporting multiple agents (all authenticated by the same MCP key, disambiguated by Workspace) is consistent with how tools like Claude Code manage multiple workspaces per connection.

**HQ relay for Workdesk Sites, edge MCP for Cloud Sites:** Deferred — viable future state for improving the personal Site experience. Standardising on edge MCP first; a hybrid relay mode can be revisited if Workdesk reachability proves a significant UX problem.

---

## Resolved decisions

- **Two Site types:** `CLOUD` Sites register a public HTTPS MCP endpoint URL in the Fleet Registry during `verify-key`. `WORKDESK` Sites register `null` — they are not discoverable by remote agents and only accept local connections.
- **No tunnel support for Workdesk Sites:** Workdesk Sites bind to `127.0.0.1`. External cloud agents must use a Cloud Site.
- **Pre-registration rejection:** The MCP endpoint returns `503 Service Unavailable` until the `site_` key is configured (status `PENDING`).
- **Endpoint registration via `verify-key`:** The Site sends its public MCP endpoint URL as part of the `verify-key` handshake. HQ writes it to the Fleet Registry atomically with the status update.
- **Fleet Registry is world-readable:** `mcpEndpointUrl` alone is not sensitive — a valid MCP key is still required to connect.
- **Constant-time key comparison:** Incoming MCP keys must be compared using `crypto.timingSafeEqual` to prevent timing attacks.
- **Active session limit:** The Site enforces a maximum number of concurrent SSE connections. Excess connections are rejected with `429 Too Many Requests`.
- **Fast fail on disconnect:** If a Site drops offline, the SSE stream drops immediately. The external agent is responsible for retries.
- **`taskId` ownership validation:** When an agent submits a result, the Site verifies the `taskId` belongs to its own org before writing to Firestore.

---

## Related

- Site connection flows — bootup, registration and agent session sequences. **The document is gone**, removed along with the connector model `adr-0022` deleted. Registration as it actually works is `adr-0044`.
- Remove Express → Cloud Functions (archived, recorded outside this repository) — why HQ no longer runs a persistent server
- HQ & Sites platform (archived, recorded outside this repository) — platform decision record
