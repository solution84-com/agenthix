---
created: 2026-08-12
description: Enforcing protocol compatibility between HQ and an Execution Site at the registration handshake.
---

# ADR-0046: Protocol Compatibility Between hq and Execution Sites

**Status:** Superseded by adr-0136

## Context

hq and an Execution Site speak a versioned protocol over the control channel ([ADR-0045](adr-0045-request-response-on-the-control-channel.md)). Both ship from one repository, and the first implementation used that fact to require the two ends to report *exactly* the same version, refusing the connection otherwise.

Shipping together is not deploying together. ADR-0042 allows hq and a site to run on separate machines, and a self-hoster upgrades on their own schedule. Staggered versions are the expected steady state, not an edge case — so exact equality is a rule that breaks during ordinary operation.

Being permissive instead is not free either. The protocol drifted once already, silently: both apps held their own copy of the version constant, they reached 3 while the shared one reached 5, and nothing noticed because nothing checked.

## Decision

`PROTOCOL_VERSION` is `major.minor`, and compatibility is decided per component:

- **Major differs → refuse the connection.** A major bump means a breaking change: a message type removed, a field's meaning changed, a required field added.
- **Minor differs → accept.** A minor bump is additive only: new message types, new optional fields. Both ends ignore what they do not recognise.

Acceptance is a negotiation, not just a check. The handshake records the peer's version on the connection, and the effective feature level is the lower of the two. Each end gates optional behaviour on that level rather than on its own version — otherwise hq at `6.3` would send frames a site at `6.0` cannot read, which is the same failure one release later.

The major sequence continues from the historical one rather than restarting: removing the retired index-sync message types was itself a breaking change, and renumbering would have hidden it. The version in force is `PROTOCOL_VERSION` in `core` — a value that moves, so it is not restated here.

## Consequences

### Positive

- An operator can upgrade hq and a remote site independently within a major version, which is how they will actually be deployed.
- A version that is genuinely incompatible fails at the handshake with a stated reason, rather than half-working and failing later at an unrelated call site.
- No new visibility mechanism needed: `describeExecutionSite` already asks a live site for its protocol version, so a lagging site is observable before it becomes a problem.

### Negative

- **Gating optional behaviour on the negotiated level is a discipline, not a mechanism.** Nothing forces a contributor to check it before sending a newly added message type. Forgetting reintroduces exactly the breakage this record exists to prevent, and it will only show against an older peer.

### Risks

- The rule is only as good as the judgement applying it. A breaking change mislabelled as a minor bump is accepted by the handshake and then half-works — strictly worse than the exact-equality rule it replaces, because it fails silently instead of loudly. Whether a change is additive is a review question, not something the version number can enforce.

## References

- [ADR-0045](adr-0045-request-response-on-the-control-channel.md) — the protocol this versions
- the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository — allows hq and an Execution Site to run on separate machines, which is what makes staggered deployment ordinary
