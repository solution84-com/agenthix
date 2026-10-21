---
created: 2026-08-17
description: Live site data crossing as typed events rather than through a generic relay.
---

# ADR-0051: Live Site Data Crosses as Typed Events, Not a Generic Relay

**Status:** Accepted

## Context

ADR-0050 established one-way `site.event` frames as the shape live site data takes on
the control channel. It did not say what happens as more of it needs to cross.

An audit of the frame dispatcher found the existing event kinds treated asymmetrically:
some validated every wire-controlled field before it reached a database row or a browser
socket, one forwarded a site-supplied event name into a browser's socket room with no
check at all. Fixing that one handler raised the question this record settles.

Because the gap was closed by making the weak handler match the strict ones, the obvious
next step — once you are already forwarding one event mostly verbatim — is a generic
relay: forward any named event, with a client-declared shape, into a room or a patch. It
would absorb the special cases and make each new kind of live data nearly free to add.

**The question:** as more live site data needs to reach hq — container status, a site's
own online/offline push, and whatever follows — what shape does each addition take?

## Decision

**There is no generic relay.** Two settled patterns cover every shape a site sends hq,
and future live data joins one of them rather than getting a mechanism of its own.

**On-demand reads are `channel.request`/`channel.response`.** hq asking site a question
and site answering is already generalized, and reading transcript history already works
this way. Nothing here changes that path; it already does what a relay would only
approximate for reads.

**Live push is a closed `site.event` vocabulary, and it stays closed.** Each kind has its
own handler that validates every wire-controlled field against an explicit shape before
it touches a database row or a socket emit, rejects and logs anything that fails, and owns
whatever side effects that kind implies. A name outside the vocabulary is dropped and
logged, never relayed.

**How new live data joins:** name the event kind in the closed set, add its wire type in
`core`, and add a handler that validates before it does anything. Never widen an existing
handler to carry a second, unrelated shape, and **never add a generic fallback branch that
skips validation for kinds nobody has written a handler for yet.**

### Why a generic passthrough or patch-applier is rejected

The per-kind machinery is load-bearing, not incidental complexity a relay could absorb.
Three things demonstrate it, and none survives being genericized:

- **A per-run terminal latch**, so a duplicate terminal frame is a no-op for side effects.
  A generic relay has no place to hang per-run, per-status state that is not itself a
  special case bolted onto the "generic" path.
- **A structural allowlist on any patch applied to an hq row** (ADR-0050). It exists
  precisely because the patch is network-controlled and the target has an owner foreign key
  and live relations. A generic patch relay is exactly the shape that would reopen
  ownership reassignment or a nested delete through what was meant to be a title update.
- **Event kinds that cooperate** — one kind synthesizing something another must never also
  send, with a guard against double delivery. A relay treating them as interchangeable
  named events has no way to know that relationship exists.

Genericizing would push all of it into a per-event configuration object — reinventing the
per-handler function this record keeps — or drop it, reintroducing the defects ADR-0050's
own review found and fixed.

*(Which kinds exist today, and what each handler validates, are the arrangement — the
hq/site split design spec §7.3 and the handler module hold them.)*

## Consequences

### Positive

- Every `site.event` kind has the same validate-before-side-effect shape. A reviewer
  asking "does this handler trust the wire" no longer has to know which one was the
  exception.
- A closed vocabulary means a name mismatch between what site sends and what hq accepts
  fails loudly — dropped and logged — rather than silently relaying an event a browser has
  no listener for, or one it was never meant to receive.
- The blast radius of a compromised or buggy site is bounded by what the handlers accept,
  which is enumerable, rather than by what a relay would pass through, which is not.

### Negative

- Adding a new live-data event kind is more code than widening a generic relay would be —
  a new core type, a new handler, new validation. This is the accepted cost, not an
  oversight: the alternative was rejected above for exactly the reasons a small amount of
  extra code would not fix.

### Risks

- **The rule is a discipline at the point of addition.** Nothing structurally prevents a
  contributor from adding a permissive handler that casts its payload and forwards it —
  which is a generic relay with one entry. Review is the only enforcement.
### Accepted residual risk

Two gaps are known, weighed, and accepted rather than closed. Neither changes the
decision; both bound what it currently delivers, and they are recorded here rather than
queued because nothing is waiting on them.

- **Coverage is per handler, so it is uneven.** `run.status` validates by construction only
  its session-patch sub-object — the fields it structurally picks. The frame's own scalars
  are a cast, and flow unchecked into socket emits, activity records and every registered
  status listener. So the rule above holds fully for two of the three kinds and partially
  for the third. Closing it means giving those scalars the same closed-set and charset
  treatment the other handlers already give their own fields. **Accepted** because the
  pattern to extend is uniform and already present in the same module; the cost of the gap
  is bounded by what those listeners do with a bad value, not by what a relay would allow.
- **Existence is checked; ownership is not.** hq confirms it holds a copy of the session a
  frame names — not that the sending site is the one that owns it. hq's session copy carries
  no site reference, so per-frame placement cannot be resolved without a lookup judged
  disproportionate here. A site could in principle name another site's session and have the
  frame relayed. **Accepted** because it is unreachable with one registered site, and
  because it is cross-contamination at the channel rather than at the mount: it does not
  bypass authorization for a run, which is minted per run up front and independent of this
  channel. It applies equally to all three event kinds — it is not specific to any one of
  them, and is not to be solved piecemeal per kind. **The acceptance expires when a second
  site is registered**, and closing it belongs to multi-site work.

  > **Partly resolved, 2026-09-15.** hq now resolves the owning site of a session the way
  > dispatch does and applies a `run.stream` frame, or a `run.status` session patch, only
  > when the sending site owns that session; the terminal latch is keyed to the session as
  > well as the run, so a foreign frame cannot consume it. Registered status listeners still
  > run for every frame and check task ownership only, so a site owning a task can still name
  > another site's session there, which is tracked as later work.
  > The acceptance above still stands for that remainder.

## References

- [ADR-0050](adr-0050-dispatch-and-status-cross-the-control-channel.md) — one-way
  `site.event` frames, the terminal latch and the structural allowlist this record cites as
  load-bearing
- the hq/site split design spec (unit `2026-08-14-hq-site-split`) §7.3 — the interactive
  relay, and the on-demand read path this record leaves unchanged
- [ADR-0040](adr-0040-hq-issued-token-ttls.md) — audience-pinned tokens, the cross-site
  containment control that already exists one layer down from the ownership gap above
