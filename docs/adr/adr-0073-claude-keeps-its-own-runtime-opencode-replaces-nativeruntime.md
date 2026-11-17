---
created: 2026-09-27
description: ClaudeSDKRuntime stays as the only path to Claude subscription billing; NativeRuntime, never finished, is retired; OpenCode becomes the second AgentRuntime implementation for every other model.
---

# ADR-0073: Claude Keeps Its Own Runtime; OpenCode Replaces NativeRuntime

**Status:** Accepted

## Context

A proposal asked whether Agenthix should stop owning an agent harness and delegate execution and
context continuity to one external, provider-agnostic harness — OpenCode was named as the
candidate. Its argument: building and maintaining an agent loop, tool execution and session
continuity across providers is substantial infrastructure that is not Agenthix's core
responsibility, and supporting several independent harnesses behind adapters doesn't solve that,
since a session moving between them would need Agenthix to own canonical context reconstruction.

Research (`docs/work/2026-09-27-model-vendor-independence/`) found that the proposal's argument, read
literally, doesn't survive contact with what Claude currently offers: `ClaudeSDKRuntime` is the
only path to Claude subscription billing — no external harness offers it: OpenCode removed
subscription login in v1.3.0, its notes saying "Anthropic explicitly prohibits" third-party
harnesses from using it. Subscription billing is the only affordable path to Claude for a single
user; the alternative, metered API-key billing, is priced for organisations. Retiring
`ClaudeSDKRuntime` in favour of any external harness would foreclose that.

Separately, `NativeRuntime` — Agenthix's own home-grown multi-provider engine, adr-0019's second
implementation behind the `AgentRuntime` interface — was found to have never been finished to
production parity. It has no manifest enforcement, no per-call authorization gate, no audit log
and no risk rating; `ClaudeSDKRuntime` is the only runtime actually in production today. Keeping
`NativeRuntime` is not a neutral status quo — it means building all of that from scratch, in-house,
which is the exact outcome the proposal argues against.

The proposal's objection to running several harnesses — that a session can't move between them without
Agenthix owning context reconstruction — doesn't apply to two harnesses that never need to swap
mid-session. An agent's runtime is fixed for its lifetime today (`ClaudeSDKRuntime` and
`NativeRuntime` already coexist this way, behind adr-0019's interface, without needing
cross-harness continuity), and nothing about adopting OpenCode changes that.

The full evaluation — OpenCode against Goose, OpenHands and finishing `NativeRuntime` in-house,
across eleven criteria — is `candidate-comparison.md` in the unit above. The integration design is
that unit's `spec.md`.

## Options considered

**Adopt OpenCode as the single harness for everything, per the proposal as written.** Rejected — it would
move Claude access to API-key billing, since no external harness offers subscription billing.

**Keep `NativeRuntime` and finish it in-house.** Rejected — it was never brought to production
parity, and finishing it means building the exact harness infrastructure the proposal argues Agenthix
shouldn't own. It was the most expensive option evaluated, not the cheapest.

**Adopt Goose or OpenHands instead of OpenCode.** Rejected — see `candidate-comparison.md`. Goose's
API-stability picture was the weakest evaluated (a deleted REST server, an all-unstable replacement
protocol). OpenHands had a stronger technical restart story but lost on community size and maturity
once that became the criterion weighted most heavily.

## Decision

> ⚠️ **Superseded by adr-0078 — this section only.** Its sentence *"Every agent's runtime is fixed for
> its lifetime"* no longer holds: a conversation keeps the runtime it started with, and an agent's
> runtime is an editable setting that applies to new conversations. **Still standing:**
> `ClaudeSDKRuntime` stays as the path to Claude, `NativeRuntime` is retired with OpenCode as the second
> runtime, the single-harness proposal is superseded as stated, and adr-0078 restates all three.

**`ClaudeSDKRuntime` stays, permanently, as the path to Claude.** It is not retired and not a
candidate in future harness decisions — no external harness can replace what it uniquely offers.

**`NativeRuntime` is retired.** It is replaced by OpenCode as the second `AgentRuntime`
implementation behind adr-0019's interface, covering every model that isn't Claude-via-subscription.

**Every agent's runtime is fixed for its lifetime**, unchanged from today. Nothing here introduces
cross-harness session portability, and nothing needs it.

**The single-harness proposal is superseded** — not accepted as written, not declined outright. Its core argument (don't
build and maintain harness infrastructure in-house) is honoured; its proposed shape (one harness
for everything) is narrowed to exclude the one runtime that was never Agenthix's to build in the
first place.

## What this binds

- Any future harness decision is about what replaces OpenCode as the non-Claude runtime, never
  about replacing `ClaudeSDKRuntime`.
- Agenthix's manifest/authorization system (self-declared capability requests, HITL approval,
  per-call enforcement, audit logging) must be built out for OpenCode from scratch — there is no
  existing second-runtime implementation to extend, since `NativeRuntime` never had one. See
  `spec.md`'s "Required capability contract."
- A tool-name mapping boundary (mirroring `sdkNames.ts`) is required for every runtime behind
  `AgentRuntime`, not just Claude's.

## Consequences

### Positive

- Claude subscription billing, and the single-user affordability it enables, is preserved without
  qualification.
- `NativeRuntime`'s unfinished, unenforced tool execution path is retired rather than carried
  forward or finished at cost.
- OpenCode's confirmed capability contract (per-call authorization with model-facing steering text,
  a stable per-call ID, real subagent sessions gated the same way as top-level calls) gives
  Agenthix a credibly maintained, provider-agnostic runtime without building one in-house.

### Negative

- Agenthix now depends on two externally-maintained runtimes with different upgrade cadences and
  naming schemes, not one.
- OpenCode's own instability (an undocumented parallel v2 release line, no stated API stability
  policy, no automatic resume of an interrupted turn) is inherited as a real, live risk, not a
  hypothetical one.

### Risks

- OpenCode's v1/v2 release-line ambiguity could force a disruptive migration if the v1 line is
  deprecated before the relationship between the two is documented upstream.
- The container test (task 1.8, still to run) could surface a restart or continuity failure severe
  enough to reopen this decision before implementation is complete. If it does, this record is
  superseded by the one that replaces it, not quietly withdrawn.

## References

- adr-0019 — the `AgentRuntime` interface this decision keeps, narrowing only which implementation
  covers non-Claude-subscription providers
- adr-0057 — containers are reset and reused, not destroyed between runs; the reason OpenCode's own
  lack of cross-process session locking is Agenthix's problem to solve, not OpenCode's
- The proposal for a single external harness — superseded by this record
- `docs/work/2026-09-27-model-vendor-independence/candidate-comparison.md` — the full evaluation
- `docs/work/2026-09-27-model-vendor-independence/spec.md` — the OpenCode integration design
