---
name: Key Management Design
created: 2026-04-25
description: Design spec for Key Management Design. Front-matter added during the docs/ migration; body unchanged.
---


# Key Management Design

**Date:** 2026-04-25
**Status:** Draft
**Branch:** hq-integration

---

## Problem

Credentials in the Agenthix site accumulated without a consistent model. The result is keys scattered across env vars and multiple DB tables, with no clear rules about where a key lives or why. This makes them hard to audit, manage from the UI, or reason about during an incident.

The specific pain points:

- `SITE_ADMIN_KEY` is used for both emergency admin recovery *and* HQ API authentication — two completely unrelated concerns
- `SiteApiKey` was designed for multiple key types but only has one (`MCP`) and its role is unclear
- `SiteGitHubConfig` is a separate singleton model with no relationship to `SiteApiKey`
- `JWT_SECRET` lives in the env file even though it is just a random signing secret with no reason to be there
- No settings UI covers all credential types in one place

---

## Design Principles

**1. The env file is for bootstrap only.**

The env file should contain the absolute minimum — things that must exist before the server can start or before the database is accessible. Everything else is operational config that belongs in the database and should be manageable from the Settings UI.

We arrived at this by asking: "does this value need to exist before we can connect to the database?" For most secrets, the answer is no. The database is always running when the server is running, so storing secrets there is just as reliable as env vars — but far easier to manage.

**2. `SITE_ADMIN_KEY` is a recovery key, nothing else.**

The site owner sets this once at deploy time. Its only job is to let them regain access if all admin users are locked out — it is valid only on the invite/bootstrap auth flow. It must never be reused for HQ authentication, agent auth, or anything else. Conflating recovery with runtime auth creates a key that is simultaneously too powerful and too hard to rotate.

**3. Auto-generate what can be auto-generated.**

Keys that are just random secrets — MCP bearer token, HQ bearer token, JWT signing secret — do not need to be set by the user. The server generates them on first boot, stores them in the DB, and they work immediately. The user can reissue them from the Settings UI if needed. This eliminates a whole class of "forgot to set env var" deployment failures.

**4. One table for all site-level secrets: `SiteSecret`.**

Rather than a separate DB model for each credential type (`SiteApiKey`, `SiteGitHubConfig`, etc.), a single `SiteSecret` table with a `type` column covers everything. Adding a new credential type is a new row, not a schema migration. All secrets are visible and manageable from one place in the Settings UI.

---

## Target Schema

```prisma
model SiteSecret {
  id        String   @id @default(uuid())
  type      String   @unique  // 'MCP' | 'HQ' | 'JWT_SIGNING_SECRET' | 'GITHUB_PAT' | 'ANTHROPIC'
  value     String            // plaintext secret value
  prefix    String?           // first 20 chars for UI display (null for non-bearer secrets)
  meta      Json?             // type-specific extras e.g. { githubOrg } for GITHUB_PAT
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Rows at runtime

| `type` | `value` | `prefix` | `meta` |
|--------|---------|----------|--------|
| `MCP` | `sk_mcp_...` | `sk_mcp_abc12345678` | null |
| `HQ` | `sk_hq_...` | `sk_hq_abc12345678` | null |
| `JWT_SIGNING_SECRET` | random 64-char hex | null | null |
| `GITHUB_PAT` | `ghp_...` | `ghp_abc12345678` | `{ "githubOrg": "acme" }` |
| `ANTHROPIC` | `sk-ant-...` | `sk-ant-abc12345` | null |

### Generation

| `type` | Who creates it | When |
|--------|---------------|------|
| `MCP` | Server | Auto on first boot |
| `HQ` | Server | Auto on first boot |
| `JWT_SIGNING_SECRET` | Server | Auto on first boot |
| `GITHUB_PAT` | User | Entered in Settings UI |
| `ANTHROPIC` | User | Entered in Settings UI (seeded from `ANTHROPIC_API_KEY` env var on first boot if present) |

---

## Migration Map — Old to New

### `SiteApiKey` → dropped, replaced by two rows

| Old field | Old value | → | New `type` | New field |
|-----------|-----------|---|-----------|-----------|
| `type = 'MCP'` | | | `MCP` | |
| `key` | `sk_mcp_abc123...` | | | `value` |
| `keyPrefix` | `sk_mcp_abc123` | | | `prefix` |

| Old field | Old value | → | New `type` | New field |
|-----------|-----------|---|-----------|-----------|
| `type = 'M2M'` | *(did not exist)* | | `HQ` | |
| — | auto-generated | | | `value` |
| — | first 20 chars | | | `prefix` |

### `SiteGitHubConfig` → dropped, replaced by one row

| Old field | → | New `type` | New field |
|-----------|---|-----------|-----------|
| `pat` | | `GITHUB_PAT` | `value` |
| `githubOrg` | | | `meta: { githubOrg }` |

### `JWT_SECRET` env var → dropped, replaced by one row

| Old | → | New `type` | New field |
|-----|---|-----------|-----------|
| `process.env.JWT_SECRET` | | `JWT_SIGNING_SECRET` | `value` |
| *(no prefix)* | | | `prefix` = null |

### `ANTHROPIC_API_KEY` env var → dropped, replaced by one row

| Old | → | New `type` | New field |
|-----|---|-----------|-----------|
| `process.env.ANTHROPIC_API_KEY` | | `ANTHROPIC` | `value` |
| *(no prefix)* | | | `prefix` = null |

---

## Why JWT Signing Secret Belongs in the DB

`JWT_SECRET` is just a random string used to sign short-lived tokens (1-hour brokered HQ sessions). It has no special reason to live in the env file — it was put there by convention, not necessity. The DB is available whenever the server is running, so reading a signing secret from `SiteSecret` at token-mint time is identical in reliability to reading it from `process.env`.

Moving it to `SiteSecret` means:
- No env var to forget at deploy time
- The server auto-generates one on first boot — zero configuration required
- The site owner can rotate it from the Settings UI if needed (active 1-hour sessions are invalidated, which is acceptable)

The only secrets that genuinely must be env vars are those needed before the DB connection is established — and `JWT_SECRET` is not one of them.

---

## Env Vars — Final State

After this change, the env file is reduced to true bootstrap-only values:

| Env var | Why it must stay env |
|---------|---------------------|
| `SITE_ADMIN_KEY` | Recovery key — must exist before DB is accessible, used only for invite/bootstrap auth |
| `DATABASE_URL` | Required to connect to the DB at all |
| Wasp framework vars (`WASP_SERVER_URL`, `WASP_WEB_CLIENT_URL`, etc.) | Framework requirement |

Everything else moves to `SiteSecret`.

---

## What Stays Separate

These are not absorbed into `SiteSecret` because they are not site-level singletons:

| Model | Why it stays |
|-------|-------------|
| `HqConnection.connectionToken` | Part of the HQ connection record — tied to connection lifecycle, not a standalone secret |
| `ProductSshKey` | One per product wiki repo — not a singleton |
| `ProjectSshKey` | One per project codebase repo — not a singleton |

---

## Code Changes Required

### 1. Schema

- Add `SiteSecret` model
- Drop `SiteApiKey` model
- Drop `SiteGitHubConfig` model

### 2. Server setup (`setup.ts`)

Auto-generate `MCP`, `HQ`, and `JWT_SIGNING_SECRET` on first boot if the row is missing. Seed `ANTHROPIC` from `ANTHROPIC_API_KEY` env var if set and no row exists. Log each auto-generated key to console once.

### 3. Auth middleware (`authMiddleware.ts`)

```
current:  validate /api/v1/* against process.env.SITE_ADMIN_KEY
target:   scope guard narrowed to /api/v1/hq/* only
          validate against SiteSecret type='HQ'
          → 503 if row missing (server not provisioned)
          → 401 if value does not match
```

Narrowing the path guard to `/api/v1/hq/*` means any future M2M integration gets its own path prefix and its own `SiteSecret` type — callers are never sharing a key.

### 4. MCP handler (`handler.ts`)

```
current:  validate /mcp against SiteApiKey type='MCP'
target:   validate against SiteSecret type='MCP'
```

### 5. HQ session handler (`hqApi.ts`)

```
current:  read JWT_SECRET from process.env
target:   read SiteSecret type='JWT_SIGNING_SECRET' from DB
```

### 6. File serving handlers (`fileServingHandlers.ts`)

`getAgentConfig` and `putAgentConfig` are HQ-facing — they should use the HQ secret, not the recovery key.

```
current:  checkAdminKey(req) → validates against SITE_ADMIN_KEY
target:   validate against SiteSecret type='HQ'
```

### 7. GitHub integration

All code reading from `SiteGitHubConfig` migrates to `SiteSecret` type=`GITHUB_PAT`, reading `meta.githubOrg` where the old `githubOrg` column was used.

### 8. Anthropic key

All code reading `process.env.ANTHROPIC_API_KEY` migrates to `SiteSecret` type=`ANTHROPIC`.

### 9. `SITE_ADMIN_KEY` scope audit

Lock down `SITE_ADMIN_KEY` / `checkAdminKey` to only:
- `inviteService.ts` — validate invite token ✓
- Bootstrap status flow ✓

Remove from everywhere else.

### 10. Settings UI — Keys & Credentials page

| Secret | UX |
|--------|----|
| MCP Key | View prefix / Reissue |
| HQ Key | View prefix / Reissue |
| JWT Signing Secret | Reissue (with warning: invalidates active HQ sessions) |
| Anthropic API Key | Enter / Update |
| GitHub PAT | Enter / Update / set GitHub Org |

---

## What This Does Not Cover

- **Per-user API keys** — not in scope; model is one value per type, site-wide
- **Key expiry / TTL** — not in scope for v1; keys are indefinite until reissued
- **Deploy key rotation** — not in scope for v1

---

## Implementation Order

1. Add `SiteSecret` model, drop `SiteApiKey` and `SiteGitHubConfig` from schema
2. Write Prisma migration — copy existing `SiteApiKey` MCP row and `SiteGitHubConfig` row into `SiteSecret`
3. Update server boot to auto-generate `MCP`, `HQ`, `JWT_SIGNING_SECRET` and seed `ANTHROPIC` from env if present
4. Update all read/write call sites to use `SiteSecret` (middleware, MCP handler, HQ API, GitHub integration, AgentEngine)
5. Audit and lock down `SITE_ADMIN_KEY` usage
6. Update Settings UI
7. Remove `JWT_SECRET` and `ANTHROPIC_API_KEY` from env file and documentation
