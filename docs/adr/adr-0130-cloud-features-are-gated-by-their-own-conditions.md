---
created: 2026-10-18
description: The blanket `cloud` flag is removed; each Agenthix Cloud feature is gated by its own real condition — the machine enrolled with Cloud, hq connected, the person's account linked — and every Cloud feature ships; none is held back by a flag fixed into a build.
---

# ADR-0130: Cloud Features Are Gated by Their Own Conditions

**Status:** Superseded by adr-0189

## Context

Host management shipped every feature that needs Agenthix Cloud behind one flag, `cloud`, off in production
(ADR-0116), because Cloud's side did not exist. Cloud is now offered from the platform's first release. One switch
for all of Cloud either hides all of it or shows all of it, and a release would have to turn it on for every
install at once.

## Options considered

**Keep the blanket flag and turn it on in a release.** Rejected: on for every install means every Cloud code path is
live everywhere, with nothing but the switch deciding.

**A setting on each install.** Rejected: ADR-0116 holds that no setting on a person's machine turns a feature on.

## Decision

**The `cloud` flag is removed. Each Cloud feature is gated by the condition it really depends on:** a Cloud
operation on a host service by the machine being enrolled with Cloud and the request coming from its pinned
controller; anything an hq does with Cloud by hq being connected; anything a person does by their account being
linked. A self-hosted hq that is not connected shows the not-connected states and never calls Cloud. **Every Cloud
feature ships; none is held back by a flag.** A flag fixed into a build cannot choose who sees a feature, since anyone
may run any build; trying a feature with some people only would be done by hq asking Cloud what applies to it, a
later feature with its own decision.

## What this binds

- No switch fixed into a build for any Cloud feature.
- A Cloud feature whose Cloud side is not live yet answers as its real state says (not connected, not available),
  never as if it worked.

## Consequences

### Positive
- Each feature is reachable exactly when what it needs exists.

### Negative
- A release shows every Cloud feature, including any whose Cloud side is not live yet; each says so in its own words.

## References

ADR-0116.
