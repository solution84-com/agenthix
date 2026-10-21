---
created: 2026-08-16
description: Dispatch and status crossing the control channel, with acceptance acked and output streamed back.
---

# ADR-0050: Dispatch and Status Cross the Control Channel

**Status:** Accepted

## Context

ADR-0045 extended the control channel's envelope with `channel.request` /
`channel.response` / `channel.error` — correlated request/response, for questions with a
prompt answer. Moving the execution runtime to site meant every agent run (chat, task,
heartbeat) had to be dispatched from hq over that same channel, with the run's outcome
coming back.

A run does not fit the request/response shape. Accepting a run — creating its row,
starting the engine — takes well under a second and fits `channel.request`'s ack timeout
easily. *Finishing* a run does not: a chat reply can stream for minutes, a task run
longer still, and the channel's existing ack timeout exists precisely to catch a
request that never gets an answer, which a long-running run would trip on trivially if
"answer" meant "the run is done." The channel also needed a shape for events that have no
question behind them at all — a stream of deltas and tool calls as they happen, and a
credential-health signal the site raises unprompted.

The question this decision settles: what rides the channel for dispatch, and what shape
carries a run's status and stream back.

## Decision

**Dispatch acks acceptance, never completion.** `run.dispatch` is an ordinary
`channel.request` (ADR-0045); the reply identifies what was created and returns well
inside the ack timeout, with the engine invoked but not awaited. The run's actual
outcome, however long it takes, is reported later, decoupled from that request/response
pairing entirely.

**Status and stream cross as one-way `site.event` frames**, a message type distinct from
`channel.request`/`channel.response`: no correlation id, no reply, and no field a caller
could populate to make one look like a request. Status transitions, per-event engine
output, and unprompted site-raised signals all take this shape.

Being fire-and-forget, `site.event` frames may be lost while the channel is down. **Two
different recoveries cover that, deliberately not a shared one:** stream frames are
ephemeral UI — a missed frame is invisible once the transcript is read normally, because
site persists every entry regardless of what reached a browser. Status frames are
recovered by reconciliation — on reconnect, and at hq boot, hq re-queries the site for
every run behind non-terminal work and feeds any terminal result found through the same
listener a live frame would have reached.

**The Task rows are the durable queue — not the channel, and not an in-memory dispatch
record.** When a dispatch fails because a site is unreachable, hq does not retry the
socket call or hold the run in memory. The task returns to its queued state carrying the
reason; when the site reconnects, every task held that way is re-run through the
*ordinary* claim path, which enforces the same serialization a live dispatch would have.
No message-queue machinery — retry, backoff, at-least-once bookkeeping — is built on top
of the channel; the durable record that already existed does the job.

**Session rows: hq creates the copy first, site owns the authoritative row.** hq creates
or upserts its own copy and mints the run's capability before dispatching, and the
dispatch carries the creation-time fields; site upserts its authoritative row from them,
idempotently. Fields site writes at runtime come back riding the terminal status frame,
never as a separate reply, and are applied to hq's copy through a structural allowlist
rather than a raw update.

**That allowlist is load-bearing, not defensive habit.** The patch is a network-controlled
object arriving at a model with an owner foreign key and live cascading relations. Applied
directly, it would let a compromised site reassign a session's owner or smuggle a nested
delete through the call that was only ever meant to update a title. Any future write-back
across this channel carries the same obligation.

*(Which fields each side owns, and the shape of the dispatch payload and the frames, are
the arrangement — the hq/site split design spec §7.1 and §10 hold them.)*

### Alternatives considered and rejected

- **Acked status delivery** — treat status and stream frames like `channel.request`,
  requiring an ack, retrying unacked frames, buffering per connection until confirmed.
  Rejected: this re-invents ordinary message-queue semantics — at-least-once delivery,
  dedup, ordering — on a channel that already has a far simpler recovery path available,
  because the durable state exists independently of the channel already. Acking would add
  real complexity to guarantee something the system already tolerates losing.
- **An hq-side run mirror** — hq keeping its own copy of the run and transcript rows, kept
  current by delta messages from site. Rejected outright: this is the delta-sync machinery
  removed at the start of the split, reappearing in miniature, and it contradicts the
  split's own principle that data exists on one side with the other reading it directly.
  It would need the same cursors and reconciliation the deleted system needed, to serve
  reads hq already answers directly over the channel.

## Consequences

### Positive

- A run of any length never occupies a `channel.request` slot or trips its ack timeout —
  only the act of accepting the run does.
- **Exactly one terminal frame per run**, and hq's status listener holds a per-run
  terminal latch, so the same frame arriving twice — once live, once via reconcile — is
  safe. Both halves are required: the two recovery paths guarantee at-least-once, so the
  listener side has to be idempotent for the design to hold.
- Because every side effect (task finalize, dashboard activity, a voice reply) lives in
  the listener rather than in the dispatch call, hq restarting between "the run finished
  on site" and "the frame arrived" cannot double an effect or drop it — reconcile
  delivers the same outcome the live frame would have.
- **Anything that used to await an in-process return value now waits on the terminal
  frame instead**, and must be given one explicitly. In-process code could return without
  announcing it; across the channel there is nothing to await unless a frame is sent. A
  caller left waiting on a signal nobody emits parks forever.

### Negative

- No delivery acknowledgement means hq cannot distinguish, from the channel alone, "site
  never sent this frame" from "site sent it and hq dropped it internally" — reconciliation
  covers the first case, listener idempotency mitigates but does not eliminate the second.
- Two different recovery mechanisms exist for two different frame kinds — a transcript
  re-read for stream, a run-state reconcile for status — rather than one uniform
  contract. A future contributor has to know both exist.

### Risks

- The type-level guard — a one-way frame carries no correlation field to populate —
  catches a caller treating one like a request at compile time, but only through the typed
  helpers. A hand-built frame on the raw socket is not caught until it logs as an
  unrecognized event and is dropped.

> **Acted on.** *(annotated 2026-09-26)* The dispatch, status and stream frames were built by the unit
> `2026-08-14-hq-site-split` (plan 5d-2), and the unit `2026-09-15-hq-site-split-close-out` completed the
> rule that hq executes nothing: hq's reads and writes of a site's disk went over the control channel and the content
> transport (two boot-time and dispatch-payload expressions aside), and after its Phase 9 hq starts no
> containers of its own. The decision is unchanged.

## References

- [ADR-0045](adr-0045-request-response-on-the-control-channel.md) — the request/response
  envelope this decision deliberately does not reuse for status or streaming
- [ADR-0049](adr-0049-the-session-is-the-container-boundary.md) — the container-per-session
  model whose status transitions this decision reports
- the hq/site split design spec (unit `2026-08-14-hq-site-split`) §7.1
  (the control channel — Task rows as the durable queue) and §10 (the session copy's
  one-writer-per-field rule, whose write-back path is the `sessionPatch` mechanism)
