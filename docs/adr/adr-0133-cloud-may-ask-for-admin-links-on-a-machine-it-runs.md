---
created: 2026-10-18
description: On a machine Agenthix Cloud runs, Cloud's controller may ask hq for three one-time links — the first admin's, an organisation admin's password reset, and an admin invitation when none is left — each narrow, never logged, and announced to every admin.
---

# ADR-0133: Cloud May Ask for Admin Links on a Machine It Runs

**Status:** Accepted

## Context

A controller never gets admin links: on an organisation's own machine they are the machine admin's, through the
command line. On a machine Cloud runs, Agenthix is the machine admin, and the owner who pays must be able to make
the first admin, recover an admin's password, or regain an admin when none is left, without a terminal.

## Decision

**On a machine enrolled with Cloud, its controller may ask hq for three one-time links:** the first admin's, only
while hq has no account (each new one ends the one before; once an account exists, hq answers who was made first and
how, never a link); a password reset for an **active organisation admin** only, answering the same whether or not
the account exists; and an invitation for a new organisation admin, only while none is left. Links are https only,
never logged, and **every use is announced in hq to every admin**, as done from Cloud.

## What this binds

- These operations are refused from anyone but Cloud's pinned controller, and on any machine not enrolled with Cloud.
- They add no authority Agenthix does not already hold as the machine's admin.

## Consequences

### Positive
- An organisation on Cloud can always regain an admin, without anyone opening a terminal.

### Negative
- A takeover of Cloud's controller could make an admin link on the machines Cloud runs; every use is announced.

## References

ADR-0115.
