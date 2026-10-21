---
created: 2026-03-24
description: Sites and connectors as separate first-class provisioned identities, each with its own credential.
---

# Sites and Connectors as Separate Provisioned Identities

**Status:** Superseded by adr-0022
**Deciders:** the maintainers

**Supersedes (partially):**
- `adr-0013-user-org-site-fleet-identity-model.md` §4 — MCP Connectors described as personal user keys
- `adr-0015-mcp-agent-connections-at-site.md` — described a single MCP key per Site

## Context

Two prior decisions created ambiguity about how MCP credentials relate to Sites and orgs:

1. The identity model ADR (archived, recorded outside this repository) (§4) modelled MCP connectors as *personal user-level* credentials: "each user provisions one personal MCP API key." It also stated "orgs do not need an MCP API key" and "MCP connectors are exclusively for individual users' personal fleets."

2. The [MCP agent connections ADR](./adr-0015-mcp-agent-connections-at-site.md) described a single MCP key per Site that multiple agents could share: "there is no per-agent key — a single MCP key can have multiple agents registered under it in HQ."

The implementation revealed that both framings were wrong. Connectors are not personal user keys, and they are not one-per-Site. They are org-owned, independently provisioned credentials that exist in a many-to-one relationship with Sites — and their lifecycle is entirely separate from the Site's own authentication.

---

## Decision

**Sites and Connectors are separate, first-class provisioned identities.**

### Site identity

A **Site** is an execution environment (a Wasp application) provisioned once per deployment. Its credential is a `site_` API key that authenticates the Wasp process to HQ. The Site key is used for the initial `verify-key` handshake, establishing a long-lived connection record (`HqConnection`) in the Site's database. Rotating or revoking the Site key severs the Site's connection to HQ entirely.

### Connector identity

A **Connector** is an MCP credential (`conn_` prefix) provisioned by an HQ admin independently of Site provisioning. Connectors are:

- **Org-owned, not user-owned.** A Connector belongs to the org, not to an individual user. Any org admin can provision, rotate, or revoke connectors.
- **Scoped to a Site.** Each Connector is associated with exactly one active Site at provisioning time. This scoping determines which Site's in-memory cache the Connector lives in and which MCP endpoint external agents connect to.
- **Many per Site.** An org can provision multiple Connectors for the same Site. Each has its own credential, prefix, and independent lifecycle.
- **Independently revocable.** Revoking a Connector does not affect the Site connection. Revoking the Site key (or disconnecting the Site) does not automatically revoke its Connectors — they remain in HQ's Firestore but cease to be served by the offline Site.

### Sync model

Connectors are not embedded in the Site's configuration at provisioning time. Instead:

1. HQ stores Connectors in Firestore under `organizations/{orgId}/connectors/{connectorId}`.
2. The Site runs a Firestore `onSnapshot` listener (`connectorListenerService`) that populates an **in-memory connector cache** on the Site process.
3. All CRUD operations (provision, rotate, revoke) in HQ are immediately reflected on the Site via this listener — no restart or reconnection required.
4. The Site UI exposes a read-only view of the in-memory cache (name, protocol, credentialPrefix, status). The plaintext credential is never returned to the browser.

### Credential separation

| Credential | Prefix | Purpose | Lifecycle |
|---|---|---|---|
| Site key | `site_` | Authenticates the Wasp process to HQ | One per Site; rotation requires reconnecting the Site |
| Connector credential | `conn_` | Authenticates an external MCP agent to the Site | Many per Site; rotation is independent and instant |

---

## Rationale

### Why org-owned, not user-owned?

The prior model (personal user MCP key) was designed for MCP tools like Antigravity or Claude Code where one tool instance = one user. Agenthesis Sites are org infrastructure — they run 24/7, independent of which user is logged in. Connectors issued for a Site need to survive personnel changes. Making them org-owned ensures that when a user leaves, their departure does not revoke the org's MCP credentials.

### Why many Connectors per Site instead of one?

Different external agents (different tools, teams, or use cases) benefit from having independently revocable credentials. If all external agents share one credential, revoking a compromised agent means revoking all agents on that Site simultaneously. The many-Connectors-per-Site model gives ops teams surgical revocation.

### Why Firestore sync instead of embedding in Site config?

Embedding Connectors in the Site's config JSON at provisioning time would mean:
- Credential rotation requires re-provisioning the Site or a custom admin API.
- New Connectors added after initial provisioning cannot reach the Site without manual steps.

Firestore `onSnapshot` pushes changes to the Site in real time without any coordination overhead. This is the same mechanism used for other HQ → Site state sync (e.g., site status updates).

---

## Consequences

### Positive

- **Independent lifecycles.** Rotating or revoking a Connector has zero impact on the Site connection and vice versa.
- **Surgical revocation.** Compromised MCP credentials can be revoked per-connector without disrupting other external agents or the Site itself.
- **Real-time propagation.** Credential rotation in HQ is reflected on the Site within seconds via the Firestore listener — no restart or re-provision required.
- **Org governance.** Connectors are org-owned; any org admin can manage them. No dependency on a specific user's presence.
- **Observability.** Site admins can see all active Connectors in the Site settings UI, giving them visibility into what MCP credentials are in use without exposing plaintext credentials.

### Negative / trade-offs

- **Firestore dependency.** The connector cache is only populated while the Firestore listener is running. If the listener fails to start (e.g., Firebase config missing), the Site has no connectors even if the Site connection is ACTIVE.
- **In-memory only.** The connector cache is not persisted to the Site's PostgreSQL database. A Site process restart triggers a full re-sync from Firestore. During the brief window between process start and snapshot delivery, the cache is empty and MCP auth will fail.
- **Connector orphaning.** If a Site is revoked in HQ, its Connectors remain in Firestore (marked REVOKED) but the Site process may continue serving requests briefly until its listener detects the revocation. This window is bounded by Firestore latency (typically < 1s).

---

## Related

- User, Org, Site, Fleet & MCP Connector Identity Model (archived, recorded outside this repository) — §4 is superseded by this ADR; §§1–3 and §§5–7 remain valid
- [MCP agent connections at the Site](./adr-0015-mcp-agent-connections-at-site.md) — the single-key-per-Site assumption is superseded; the rest of that ADR (SSE endpoint, session limits, polling model) remains valid
- HQ & Sites platform (archived, recorded outside this repository) — platform-level architecture that this ADR refines
