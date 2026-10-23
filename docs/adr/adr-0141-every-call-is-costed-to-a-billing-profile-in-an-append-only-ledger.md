---
created: 2026-10-23
description: HQ costs every model and voice call to a billing profile in an append-only ledger, with the price fixed when written and its basis named; costing is HQ's, billing is Cloud's.
---

# ADR-0141: Every Call Is Costed to a Billing Profile in an Append-Only Ledger

**Date:** 2026-10-23
**Status:** Accepted

## Context

HQ counted some usage, but nothing tied a call to who should pay for it, prices were looked up when a report was
drawn, and calls through Agenthix Cloud could only be estimated. An organisation working for several clients
needed its costs split by client, and Cloud needed a record it could reconcile against.

## Options considered

- **Report from the vendor's bills.** Exact, but late, per vendor, and with nothing to say which project or client a
  call was for. Rejected.
- **A mutable usage table, priced when read.** Simple, but a price change rewrites history and a corrected figure
  leaves no trace. Rejected.
- **Billing in HQ.** Would make every self-hosted HQ an invoicing system. Rejected: costing is HQ's, billing is Cloud's.
- **An append-only ledger costed to billing profiles (chosen).**

## Decision

**Every call is one row in an append-only ledger**: who, where (project, agent, person), which model via which
provider, the quantities, and **a price fixed when written**, with its basis named: actual (from Cloud), estimated
(from a price list, voice at the vendor's list price), awaiting Cloud's figure, included in a subscription, or
unpriced. A correction is a new row, never an edit. **Every call is costed to a billing profile**: a project's, or the
organisation's default for everything else. Months are cut in the organisation's time zone. **HQ costs; Cloud bills**
from its own meter and reports its actual figures back.

## What this binds

Every new source of calls writes ledger rows through the one writer, once per call. Reports read the ledger and
never re-price it. Undoing it means losing the history the reports and Cloud's reconciliation rely on.

## Consequences

### Positive
- Costs by client, project, agent and person, reproducible months later.

### Negative
- Estimates on own keys can differ from the vendor's bill (plans, discounts); the report says so.

### Risks
- A call that never reports (a browser closed mid-session) leaves no row; accepted, and bounded by the session's cap.

## References
Supersedes adr-0127-s-1. adr-0130, adr-0138, adr-0139.
