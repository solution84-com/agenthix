---
created: 2026-03-25
description: One mcp_ key per site, named for the protocol it grants rather than for a connector entity.
---

# ADR-0018: MCP Key as a Site Credential

**Status:** Superseded by adr-0022

## Context

ADR-0016 modelled connectors as org-level resources, provisioned in HQ Firestore and synced down to Sites. ADR-0017 superseded this, establishing that agent execution is a Site concern and connectors are not an HQ concern.

ADR-0015 introduced the `conn_` prefix for keys used to authenticate MCP connections. This framing was a carry-over from the connector-as-org-resource model: the `conn_` prefix implied a named connector identity, and the many-per-site cardinality implied each connector was a distinct entity with its own lifecycle. Both assumptions are wrong under ADR-0017.

The actual function of the key is simpler: it authenticates a communication pathway. An agent presents the key to gain access to the Site's MCP server. There is no connector identity, no per-agent routing, and no org-level lifecycle. The key belongs to the Site.

## Decision

- **Rename `conn_` → `mcp_`.** The prefix reflects the protocol the key grants access to, not a connector entity. Connectors no longer exist as a concept.
- **1:1 cardinality.** One `mcp_` key per Site. Multiple agents may use the same key simultaneously; agent identity is not in the key.
- **Stored in Site PostgreSQL** as a `SiteApiKey` row with `type = 'MCP'`. The Site manages its own credentials without HQ lifecycle involvement.
- **Stored plaintext.** The Site's local PostgreSQL is a trusted boundary. Plaintext storage lets users copy the key directly from the admin UI when configuring agents.
- **No rotation — re-issue.** Revoking a key means deleting the row and generating a new one. No soft-delete or rotation state is needed.
- **`SiteApiKey` table uses a `type` discriminator.** The `type` column is the unique key, enforcing 1:1 cardinality per type and allowing future key types (A2A, WEBHOOK, etc.) without schema changes.
- **`setup()` MCP tool added as the Machine Setup handshake.** After an agent authenticates, it calls `setup()` to confirm connectivity. The tool returns `{ siteId, orgId, status: 'ready' }`. No state is written — it is a read-only confirmation.

## Consequences

- Auth is a single PostgreSQL query: `SiteApiKey.findFirst({ type: 'MCP' })` + `timingSafeEqual`. No Firestore sync, no cache invalidation.
- No per-agent key rotation. Rotating the `mcp_` key affects all agents connected to the Site simultaneously — a deliberate trade-off given 1:1 cardinality.
- Future key types (A2A, WEBHOOK) are accommodated by adding rows with a new `type` value. No schema migration needed.
- HQ no longer has a ConnectorsPage or connector Firestore collection. The connector concept is fully removed from HQ.
- The Site must function when HQ is unreachable — storing the key locally satisfies this requirement.

## Alternatives considered

**bcrypt hash storage.** Rejected — a hashed key cannot be displayed after provisioning. Since users must copy the key into agent configuration, plaintext in a locally-trusted DB is the correct trade-off.

**Keep `conn_` prefix.** Rejected — connectors no longer exist as a concept. The prefix would be misleading and inconsistent with ADR-0017's removal of the connector model.

**Many `mcp_` keys per Site (restore previous cardinality).** Rejected — multiple keys per Site reintroduces per-agent identity in the key, which ADR-0017 explicitly removed. One Site, one execution environment, one MCP key.

## Related

- [ADR-0017 — Agent Execution is a Site Concern](./adr-0017-agent-execution-as-site-concern.md) — this ADR implements the credential model ADR-0017 implied
- [ADR-0015 — MCP Agent Connections at the Site](./adr-0015-mcp-agent-connections-at-site.md) — SSE endpoint mechanics and session model remain valid; `conn_` credential framing is superseded by this ADR
