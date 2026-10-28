---
created: 2026-10-27
description: hq installs an asset from any source — its own image, an upload, a URL — through one check. A package's canonical fingerprint is signed in a Sigstore bundle, verified offline. The publisher is the verified signer, never the manifest's claim; unsigned assets install after a warning under their own namespace; a tampered one is refused.
---

# ADR-0158: An Asset Is Installed From Anywhere Through One Signed Protocol

**Date:** 2026-10-27
**Status:** Accepted

## Context

Organisations need skills and templates from Agenthix, from each other, and from people who write them. hq is the
organisation's own (adr-0042), may run offline, and no organisation should have to run a registry. When this was
decided, a package's `publisher` was free text: any package could claim to be Agenthix's, and nothing checked that a
package had not been changed on the way.

## Options considered

- **Agenthix runs the only registry.** Rejected: a self-hosted hq would depend on a service to get skills, and private
  skills would have nowhere to come from.
- **Each organisation runs its own registry.** Rejected: an operational burden nobody asked for.
- **Trust the manifest's publisher.** Rejected: it lets any package take a trusted name and arrive as an update.
- **Refuse unsigned assets.** Rejected: most skills people write are unsigned; refusing them pushes them into files,
  where they are checked less.
- **Sign with the person who released it, or with both person and organisation.** Rejected: trust would reset when a
  person leaves, and who released something inside an organisation stays internal.
- **One open protocol, any source, signature checked offline, publisher taken from the signer (chosen).**

## Decision

1. **Every source goes through the same check**: hq's image, an upload, a URL. Where a package came from decides only
   how hq fetches it. hq installs and never publishes.
2. **What is signed is a canonical statement** `{format, kind, publisher, name, version, fingerprint}`, the fingerprint
   one digest over every file stored, `package.json` included. Ambiguous archives (duplicate entries, paths differing
   only by case or normalisation) are refused.
3. **The signature is a Sigstore bundle**, keyless or with a key pair, verified offline against a trust root shipped in
   hq's image, including the transparency-log proof. A trusted keyless publisher is bound exactly: issuer, certificate
   identity, and repository and ref (tags or the default branch only).
4. **Four outcomes:** signed by someone trusted installs; signed by someone new asks whether to trust them; unsigned
   installs only after the person confirms they read it, if the organisation allows it; changed after signing is
   refused, with no override.
5. **The publisher is the verified signer**, as this organisation named it when trusting it. Every asset in a package
   takes the package's verified publisher. Unsigned assets install under `unsigned/` and never update or replace a
   signed one. `agenthix/` is reserved for Agenthix's release identity. A different signer is always a different
   asset, never an update.
6. **The organisation signs, not a person.**
7. **A fetch from a URL is guarded**: HTTPS, no internal addresses, checked on each redirect, bounded, no credentials.

## What this binds

- Every way an asset enters an organisation, now and later (a git source, a hosted registry), goes through this check.
- No code takes a publisher from a manifest.
- Verification says who published something, never that it is safe; screens must not say otherwise.
- hq carries a Sigstore verifier and a trust root refreshed each release.

Undoing it means every source would need its own trust rule, and identity claims would be unchecked again.

## Consequences

### Positive

- Self-hosted organisations get skills from anywhere without registering anywhere.
- An identity can't be borrowed, so updates and de-duplication can be trusted.

### Negative

- Publishers who want to be trusted must sign; until they do, their assets read as unsigned.
- A trust root that is too old makes checks fail until hq is updated.

### Risks

- **An unsigned asset is installed by someone who didn't read it.** Accepted: the organisation can refuse unsigned
  assets, installing grants no capability, and the record names who installed it.

## References

- adr-0042 — hq is the organisation's own.
- adr-0117 — the platform's images are signed the same way.
- adr-0157 — the asset layer this installs into.
