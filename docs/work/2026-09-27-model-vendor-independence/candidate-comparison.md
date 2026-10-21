---
created: 2026-09-27
description: The phase-1/2 evaluation record — OpenCode, Goose, OpenHands and finishing NativeRuntime in-house, compared criterion by criterion, and why OpenCode was chosen. Moved out of spec.md so the spec can focus on designing OpenCode into the platform.
---

# Candidate Comparison · Model vendor independence

This is the evaluation record, kept separate from `spec.md` once the decision was made. `spec.md`
is now about how OpenCode gets designed into the platform; this document is why OpenCode won and
why Goose, OpenHands and finishing `NativeRuntime` in-house did not — kept so the same ground
doesn't have to be re-covered if this decision is ever revisited. Sourced findings are kept in research
notes outside this repository; this document summarises them.

## The eleventh criterion: community trust and maturity

Added mid-phase-1 after the raw popularity numbers turned out to be misleading in two different
ways: the most-starred candidate (OpenCode) is also the youngest and carries the heaviest
open-issue backlog relative to its size, and one candidate's headline star count (OpenHands,
89.3k) turned out to be measuring a repository that had since been repurposed away from the
harness code entirely (see below). Judged on: age, release/version discipline, contributor
concentration, governance, and disclosed security history — not stars alone.

## Candidates

**Compared:** OpenCode, Goose, OpenHands, and finishing `NativeRuntime` in-house.
**Fixed, not a candidate:** `ClaudeSDKRuntime` — no external harness offers Claude subscription
billing (confirmed on all three; see criterion 7), and subscription billing is the only affordable
path to Claude for a single user.

**"Finishing `NativeRuntime` in-house" is not the status quo it sounds like.** `ClaudeSDKRuntime`
is the only runtime actually in production; `NativeRuntime` is a 119-line stub with no manifest
enforcement, no per-call authorization gate, no `ToolCallLog` audit, and no risk rating — it runs
every registered tool completely unrestricted. None of that plumbing exists to keep; all of it
would have to be built from scratch, in-house, which is exactly the outcome the single-harness proposal argues against.
This is the most expensive of the four options, not a free "do nothing." It's kept as a column so
the comparison can say why building in-house lost, not because it was a live contender.

## Comparison

| # | Criterion | OpenCode | Goose | OpenHands | Claude Agent SDK (fixed, for reference) |
|---|---|---|---|---|---|
| 1 | Multi-provider/model | Solid | Solid — mid-session provider switch's message adaptation unclear | Solid (LiteLLM), mid-conversation model switch | **None.** Zero non-Anthropic support anywhere in `sdk.d.ts`; `apiProvider` enum is a hosting/billing channel for Claude only |
| 2 | Session continuity | Solid — SQLite, needs a stable mount path | Solid — SQLite, but schema has changed 19 times in a year | Solid — file-per-event, resumes on open, own compaction | Solid (existing KB coverage) |
| 3 | Headless operation | Solid — `opencode serve`, **unauthenticated unless a password is set** | Solid — `goose serve` **refuses unauthenticated clients by default** (safer default than OpenCode) | Solid — REST, WebSocket, webhooks | Solid (subprocess model; existing KB coverage) |
| 4 | SDK/API stability | **Unclear** — undocumented, unexplained parallel v2.0.18 release line; no stated stability policy | **Unclear/weak** — REST server deleted 2026-07-07, replaced by an Agent Client Protocol where all 111 of Goose's own methods are namespaced `_goose/unstable/`; SDK covers only the model-provider layer and is itself alpha | **Solid on paper** — a written 5-minor-release deprecation policy — but weak in practice: 5 minors shipped in ~3 weeks, so the "generous" runway is actually very short in wall-clock time | No LTS channel; a breaking change shipped in a *patch* release (0.2.69), project-admitted as unintentional |
| 5 | Tools/MCP | Solid | Solid | Solid | Solid (existing KB coverage) |
| 6 | Permissions/isolation | Solid fit — explicitly unsandboxed by its own `SECURITY.md`, says "use a container" (matches Agenthix's model) | Solid fit but no `SECURITY.md`-style disclosure; no sandbox, shell inherits full environment, default mode is fully autonomous | **Weakest documentation** — no sandbox of its own, no timeout on pending approvals, no `SECURITY.md` at all. Agenthix's container becomes its sandbox directly (no double container layer) only if its own Docker-in-Docker modes stay off | Solid (existing KB coverage) |
| 7 | Provider auth | Anthropic **API-key only** — subscription login removed in v1.3.0, "Anthropic explicitly prohibits" it | Anthropic **API-key only** — a subscription is reachable only by delegating the turn to Claude Code itself, which forfeits Goose's own tools and session resume (worse than OpenCode here: no direct path at all) | API keys, Bedrock, URL-fetched secrets; **ChatGPT** is the only subscription login supported (not Claude) | The only one of the four with real Claude subscription billing |
| 8 | Usage/token reporting | Solid — self-estimated cost | Solid — but reports the **session's lifetime totals**, not the individual run's | Solid — tokens per call *and* per LLM, cost as a LiteLLM estimate (most granular of the three) | Solid (existing KB coverage) |
| 9 | Failure/restart | **Partly unclear** — a turn cut off by a kill is repaired on next read, but nothing resumes it automatically, and nothing stops two processes touching one session at once | **Weakest here** — a step is only saved once it *finishes*; a killed container loses the entire in-flight step, and leftover tool calls are deleted from history rather than marked interrupted (read from source, not tested live) | **Strongest of the three** — marks interrupted conversations on startup and closes the dangling tool call properly; holds a 45-second ownership lease so a replacement container waits before taking over (real single-writer protection the other two lack). Real open risks instead: a host crash can leave a conversation permanently unloadable with no repair path; an API-key rotation permanently breaks older conversations; sub-agents are orphaned after restart | **Purpose-built for exactly this**: `CLAUDE_CODE_RESUME_INTERRUPTED_TURN`/`CLAUDE_CODE_RESUME_REASON` names `container_recreated` as a first-class resume reason |
| 10 | Deployment/upgrades | Partly unclear — autoupdate on by default, arbitrary provider packages can be pulled at runtime, cross-version DB compatibility undocumented | Mostly solid — one directory (`GOOSE_PATH_ROOT`) holds all state to mount, no self-update; nothing stops an older binary opening a newer schema | Partly solid — deployment story is documented; upgrade compatibility of *stored conversations* across versions is unclear | Requires care with per-platform native binary resolution in cross-arch container builds; module entry points still being restructured |
| 11 | Community trust/maturity | Real leader on stars (210k) among the three, but **youngest** (~1.4 yr) and carries **the highest open-issue-to-star ratio** (2.95%, vs. 0.8–2.1% for the others) | Facts solid, substance mixed: Linux Foundation governance (announced Dec 2025, repo moved Apr 2026) looks like diversified control, but Block-affiliated commit share **rose** after the move (40%→45% non-bot, 31%→51% core maintainers); 6 of 7 core maintainers are Block-affiliated; one disclosed high-severity security advisory (fixed in 1.44.0) | **The scan's 89.3k-star figure was measuring the wrong repository.** On 2026-07-27 `OpenHands/OpenHands` was emptied and repurposed into a frontend product ("Agent Canvas"); the old code moved to `OpenHands/legacy`. The harness Agenthix would actually run is `OpenHands/software-agent-sdk` — **~13 months old, 1,174 stars**, not 89k. Its "852 open issues" figure also counted open PRs; issues alone are 442. Six contributors hold ~63% of attributed commits | N/A — Anthropic-backed, but that's vendor durability, not open-source community trust; a different kind of "trust" than the other three |

## What the research surfaced that changed the shape of the comparison

**OpenHands is not the mature, 89k-star project the initial scan found.** The actual harness code
(`software-agent-sdk`) is younger than OpenCode and far smaller by every popularity measure. What
survives from the original scan is the architecture — controller + sandboxed runtime per task,
closely matching Agenthix's own container-per-run model — and, after directly investigating the
flagged resume bugs rather than taking them at face value, a genuinely stronger restart story than
either OpenCode or Goose: a real ownership lease, and interrupted-conversation handling that
neither of the others has. Its real open risks (unrepairable conversations after a host crash,
broken continuity after key rotation, orphaned sub-agents) are different from, and arguably more
severe individually than, OpenCode's or Goose's — but they're documented, tracked GitHub issues on
an active project, not silent gaps.

**Goose's governance story is weaker in substance than in announcement.** The Linux Foundation
move is real, but the commit-authorship data says control concentrated toward Block rather than
diversifying away from it in the months after. Its API-stability picture is also the weakest of
the three — an entire REST server was deleted and replaced with a protocol whose own methods are
still marked unstable.

**OpenCode remains the most popular and the most "integration-ready"** — a documented HTTP/OpenAPI
server with a generated JS SDK is a materially easier integration surface than Goose's ACP or
OpenHands' younger REST API — but is also the youngest of the three and carries a disproportionate
open-issue backlog relative to its size. Its unresolved v1/v2 release-line split is a real, unquiet
question mark on criterion 4 that neither of the other two shares in the same form.

**None of the three offers Claude subscription billing.** This is structural (Anthropic restricts
it to its own harness), not a gap any of the three is likely to close, which is what makes
`ClaudeSDKRuntime` a fixed keeper rather than a fourth candidate in this table.

## Beyond the eleven criteria: the capability-contract check

Once OpenCode was the leading candidate, it was checked directly against source for capabilities
the eleven criteria don't name but Agenthix's own architecture requires — see `spec.md`'s
"Required capability contract" for the full list. The two load-bearing findings: OpenCode's
permission API supports live per-call authorization with model-facing steering text (a `reject`
reply with a `message` becomes a `CorrectedError({feedback})` the model sees and can act on,
confirmed against a repository test) and a stable per-call `callID` — both genuinely present, not
superficially similar to Claude's equivalents. Its subagent (`task`) tool spawns real, separately
addressable sessions whose own tool calls flow through the identical permission mechanism, so a
subagent's access to a platform tool is governed the same way a top-level agent's is. Goose's and
OpenHands' permission/subagent APIs were not checked to this depth, since the decision had already
converged on OpenCode by the time this check was run.

## Decision

**The owner chose OpenCode**, on 2026-09-27. Two things this decision is not:

- **It is not a pure technical read of the table above.** The lead's draft recommendation (this
  document's original form) leaned toward OpenHands, on the strength of its restart handling — the
  one criterion documentation is least reliable on, and the one closest to Agenthix's own
  container-reuse model. The owner weighed OpenCode's name recognition and community size (task
  1.3's "community trust" criterion) more heavily than that technical lean, on the reasoning that
  a harness nobody has heard of is a harder dependency to keep trusting over time, independent of
  what today's documentation says about its internals.
- **It is not a decision made blind to OpenCode's weaknesses.** Its youth, its open-issue backlog,
  its unresolved v1/v2 split, and its weaker restart story (versus OpenHands) are all real and are
  carried into `spec.md` as things the design has to account for, not facts the decision erased.

**Goose and OpenHands are declined.** Goose's API-stability picture (a deleted REST server, an
all-unstable replacement protocol) was the weakest of the three regardless of which way the
decision went. OpenHands, despite the stronger technical restart story, was declined chiefly on
immaturity and community size relative to OpenCode, once that became the criterion the owner
weighted most.

**Finishing `NativeRuntime` in-house is declined** — it was never a serious contender; see above.

This decision is recorded in [adr-0073](../../adr/adr-0073-claude-keeps-its-own-runtime-opencode-replaces-nativeruntime.md),
which keeps adr-0019's runtime interface and records that the single-harness proposal is superseded: not because a single multi-model harness was wrong in
principle, but because `ClaudeSDKRuntime` turned out to be structurally exempt from the "own no
harness" argument (Agenthix didn't build it, and no external harness can replace what it uniquely
offers — Claude subscription billing).
