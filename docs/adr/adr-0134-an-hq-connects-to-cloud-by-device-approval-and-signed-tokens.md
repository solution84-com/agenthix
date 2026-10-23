---
created: 2026-10-18
description: An hq connects to Agenthix Cloud by the OAuth 2.0 device flow, authenticates every later request with a JWT signed by its own Ed25519 key, and disconnects by revoking that key; no long-lived secret is shipped or sent to hq.
---

# ADR-0134: An hq Connects to Cloud by Device Approval and Signed Tokens

**Status:** Accepted

## Context

A self-hosted hq can connect to Agenthix Cloud, and an hq that Cloud runs connects the same way. The connection must
be made outward from hq, approved by a person who is an admin of the organisation on both sides, and must never
depend on a secret built into the code or handed to hq that could leak and be replayed. Cloud's server follows the
same contract, so it has to be one Cloud can build with ordinary libraries.

## Options considered

**A shared secret Cloud gives hq at approval.** Rejected: a long-lived bearer secret stored in hq's database, which
works for anyone who copies it.

**A scheme of our own (signed envelopes, as the host service uses).** Rejected: Cloud's side would need our code to
speak it, and nothing standard checks it.

**OAuth 2.0 with a client secret.** Rejected for the same reason as a shared secret.

## Decision

> ⚠️ **Superseded by adr-0144 — this section's last bullet only.** Cloud is connected and disconnected from HQ by an
> organisation admin; the Fleet Console only shows the connection. *(annotated 2026-10-23)* The key now also rolls
> over every 90 days (adr-0143). Everything else here still stands.

**hq makes an Ed25519 key pair and keeps the private key with its encrypted secrets; it never leaves hq.** The
connection uses established standards, defined in `core/src/cloud/connection.ts`:

- **Approval is the OAuth 2.0 Device Authorization Grant (RFC 8628).** hq sends its public key and gets a device code,
  a short user code and Cloud's approval page; an organisation admin approves there after checking the user code
  matches the one hq shows. hq polls at the interval Cloud gives, slowing down when told.
- **Every later request is authenticated with a JWT hq signs (RFC 7523, `private_key_jwt`).** The client id is the
  RFC 7638 thumbprint of hq's key; each assertion names the endpoint it is sent to, lives a minute, and carries a
  `jti` Cloud accepts once. Polling is signed too, so a device code alone completes nothing.
- **Access tokens are short-lived**, kept in memory and fetched again by signing; none is stored.
- **Disconnecting revokes the key's registration** with a signed request, and hq destroys the key, so a later
  connection has a new one. Cloud ending it from its side is learnt as `invalid_client`.
- In the Fleet Console, only a fleet admin who is also an organisation admin may connect or disconnect; hq decides.

## What this binds

- No long-lived secret for the connection is ever shipped in code or sent to hq; the private key stays in hq.
- The connection is always made outward from hq. hq calls Cloud only while connecting or connected.
- Changes to the contract go through `core/src/cloud/`, which Cloud's server depends on.

## Consequences

### Positive
- A copy of hq's database without `SECRETS_MASTER_KEY` gives nothing that connects; a stolen access token lapses
  within the hour.
- Cloud can implement its side with standard OAuth tooling.

### Negative
- A request waiting on approval lives in hq's memory; a restart drops it and the admin asks again.

## References

RFC 8628, RFC 7523, RFC 7638, RFC 8037. ADR-0042, ADR-0130.
