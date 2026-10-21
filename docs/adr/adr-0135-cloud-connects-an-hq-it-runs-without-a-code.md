---
created: 2026-10-19
description: On a machine Agenthix Cloud runs, Cloud connects hq to the organisation it runs hq for through the host service, with no code to approve; hq keeps its own key and keeps the connection only once that key signs for a token.
---

# ADR-0135: Cloud Connects an hq It Runs Without a Code

**Status:** Accepted

## Context

An hq connects to Cloud by device approval (ADR-0134): an organisation admin asks in the Fleet Console and approves
on Cloud after checking a short code. The code proves that the hq asking is the one the person approving is looking
at. On a machine Cloud runs, Cloud already knows that: it made the machine for the organisation, enrolled it with a
one-time code, and speaks to it only in envelopes both sides sign. Asking that organisation's admin to approve a code
repeats what Cloud knows, and leaves an hq on Cloud unconnected until someone does.

## Decision

**On a machine enrolled with Cloud, its controller connects hq in two steps through the host service:**
`organisation.key`, to which hq answers its connection key (made if it has none; the private key never leaves hq),
and, once Cloud has registered that key for the organisation it runs hq for, `organisation.connect`, on which hq signs
for an access token with the key and keeps the connection only once Cloud gives one. From then on the connection is
the same as one an admin approved. hq accepts these only when its host service has told it that Cloud runs its
machine, and the Fleet Console cannot disconnect it there.

## What this binds

- Refused from anyone but Cloud's pinned controller, and on any machine not enrolled with Cloud; device approval
  stays the only way for an hq an organisation runs itself.
- hq's key is made by hq, as for every connection; Cloud only registers it.

## Consequences

### Positive
- An hq on Cloud is connected from the start, with no step for its admins.

### Negative
- A takeover of Cloud's controller could connect the hqs Cloud runs to another organisation; the connection is
  announced to every admin, as every connection is.

## References

ADR-0133, ADR-0134.
