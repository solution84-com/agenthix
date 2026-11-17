---
created: 2026-09-27
description: Designing OpenCode into Agenthix as the runtime behind every model that is not Claude on a subscription — one long-lived server per container, permissions read at every turn, and processes that belong to the conversation that started them. ClaudeSDKRuntime stays fixed; NativeRuntime is retired. See candidate-comparison.md for why OpenCode was chosen.
---

# Design Spec · Adopting OpenCode into Agenthix

**Decision (2026-09-27): adopt OpenCode.** `ClaudeSDKRuntime` stays fixed — no external harness
offers Claude subscription billing, and subscription billing is the only affordable path to Claude
for a single user. `NativeRuntime`, a 119-line stub that was never brought to production parity, is
retired. OpenCode becomes the second real `AgentRuntime` implementation, behind the same interface
(adr-0019), covering every model that isn't Claude on a subscription. The full evaluation — why
OpenCode won over Goose, OpenHands and finishing `NativeRuntime` in-house — lives in
`candidate-comparison.md`. This document covers how OpenCode is built into the platform.

The decision is recorded in adr-0073, which keeps adr-0019's runtime interface and supersedes the single-harness proposal.
The design was paused on 2026-09-27 until person-scoped execution changed the container model,
and resumed on 2026-09-28 on top of it: a container is keyed on its boundary and its runner (adr-0074),
runs are ordered only within a conversation (adr-0075), a conversation whose harness state is gone is
closed (adr-0076), and a conversation keeps the runtime it started with (adr-0078).

Sourced facts about OpenCode live in the maintainers' research notes, outside this repository, which this spec cites rather than
repeats. Source references are to OpenCode v1.18.32 (`packages/opencode/src/` unless another package is
named). On 2026-09-29 the build's verification phase ran the design's open points against OpenCode
1.18.32 and the Claude Agent SDK 0.2.141, and what it found is written in where it applies. Claims
still marked **to verify** are checked in the build lanes. Weaknesses in the gate read in OpenCode's
source but not run are assumed real and designed against ("Keeping the gate whole").

## What Agenthix needs from any runtime behind `AgentRuntime`

Gathered from the site's runtime as it stands; this held before OpenCode was chosen and still governs
its design:

- A per-call authorization callback that can carry model-facing steering text, not just allow/deny
- Isolation between runs sharing one container
- Discrete tool_call/tool_result events keyed by a stable ID, for live gating and audit logging
- Raw tool output passed through largely unmangled — encoding and NUL-byte handling are Agenthix's job
- A way to disable a harness's own default config, settings and plugin discovery, since every
  permission must originate from Agenthix's own verified capability and nothing else

## Required capability contract

Whatever sits behind `AgentRuntime` must satisfy all of these — a missing one is a design problem to
solve, not a feature to quietly drop for that runtime.

| # | Capability | OpenCode status |
|---|---|---|
| 1 | Per-call authorization with model-facing steering text | **Met by Agenthix's plugin, not OpenCode's permission system**, which its own security policy calls a UX aid and not a security boundary. The plugin's `tool.execute.before` hook runs before every tool call — built-in, plugin and platform tools alike — with its arguments, and refuses a call the gate rejects. Verified: a refusal thrown there ends that call only, the model's next request carries the thrown message verbatim as the call's result, and the turn continues. |
| 2 | A stable per-call ID correlating a tool call to its result | **Met.** `tool.execute.before` and `tool.execute.after` carry the call id and the session id. |
| 3 | A native-name ↔ canonical-name mapping, isolated to one boundary | **Not built yet.** See "Tool-name mapping". |
| 4 | A way to disable the runtime's own config, settings and plugin discovery | **Partly met.** `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`, `OPENCODE_DISABLE_EXTERNAL_SKILLS` and `OPENCODE_DISABLE_CLAUDE_CODE` turn off most of it, but OpenCode always reads two configuration folders in the home, and no flag turns them off. Agenthix closes them itself ("Keeping the gate whole"). |
| 5 | Subagents flow through the same authorization as top-level calls | **Not needed in this unit.** Subagents are out of scope and OpenCode's `task` tool is denied (§5). |
| 6 | No forced nested containerization | **Met, by choice.** `LocalWorkspace` runs in the calling process; the Docker workspace would start a nested container. Agenthix configures `LocalWorkspace` explicitly. |
| 7 | Caller-specified session resumption that survives a kill, with one writer per session | **Met.** Sessions resume by id: the person-scoped execution spike resumed one in a new container, and a server killed with `SIGKILL` and started again on the same home continued its session from history. OpenCode does not stop two processes writing one session; the platform does, by ordering a conversation's turns (adr-0075). |
| 8 | Documented, not silent, output transformation | **Partly met.** The shell tool truncates long output and adds its own `"...output truncated..."` and `<shell_metadata>` text — documented in source, but a divergence from raw passthrough Agenthix must accept or normalise. |
| 9 | An existence check for a conversation (adr-0076) | **Met.** `GET /session/:id` answers `404` for a session that never existed and for one whose home was removed. See §4 for how to read a server that is still starting. |

## 1. Harness lifetime: each harness runs the way its vendor intends — decided 2026-09-28

**Every harness is run the way its vendor intends, and for both harnesses that means staying warm
across a conversation's turns** (adr-0081). A warm harness ends when the conversations it serves go idle,
by the conversation idle timer (§3). The measurements, each vendor's guidance and the options weighed are
in [harness-lifetime-analysis.md](harness-lifetime-analysis.md); this section holds the design that
follows from them.

In short: a new Claude process costs a turn about 0.25 s and a warm one about 250 MB; a new OpenCode
server costs a turn about 2.4 s and holds 0.3–0.7 GB. Claude's documentation calls streaming input — one
long-lived process — its preferred mode, and documents interrupting a turn only in it (in practice both
modes interrupt, below); OpenCode's describes one server that every client attaches to, to avoid cold
starts.

### OpenCode: one server per container

**One `opencode serve` process per container**, one boundary and one runner (adr-0074), hosting every
OpenCode conversation in that container as its own session.

- **Started** when a turn is dispatched to a container with no running server, alongside the rest of the
  launch, to hide what it can of the start-up (about 1.3 s to the end of the first turn as built, with
  Agenthix's plugin and outbound settings and a stand-in model). It is started **without any conversation's tag** (§3).
- **Listens only on the container's own loopback address**, on a fixed port, protected by a password
  generated per server (`OPENCODE_SERVER_PASSWORD`). The server is open without it.
- **The site drives it through one persistent relay**: a single long-running `docker exec` running a
  small relay that carries every request and the server's event stream (`GET /global/event`, which
  carries every project folder's events on one stream, where `GET /event` covers one folder and ends
  when that folder's state is discarded). A request through
  it costs about 1 ms, a new `docker exec` about 31 ms (Docker Desktop); twenty tool calls, each
  approved over the relay, took half a second in all. Never over the network: the site
  already reaches what listens in a container through `docker exec` (`containerNetwork.ts`), and on macOS
  the host cannot reach a container's address at all. The relay outlives the server; when the server
  stops its event stream ends, and the site subscribes again.
- **Stopped when the last conversation it serves goes idle** (§3), and with the container.
- **Restarted** when it crashes. Conversations resume from the home: after `SIGKILL`, a fresh server on
  the same home continued the session from its history. A restart drops every platform-tool connection,
  so the site adds them again (§2). A provider key never restarts anything (§6).
- **A turn is sent with `POST /session/:id/prompt_async`** and ends on the stream's `session.idle`, so no
  relay request is held open for a whole turn and every request keeps its time limit. If the stream ends
  while the server keeps running, the turns running on it fail — the events they missed cannot be
  recovered — and the stream is followed again for later turns.
- **An OpenAI-compatible endpoint's model names are set in the server's configuration**, the one
  provider setting that is not per request: OpenCode reads a compatible provider's models only from
  there. Its address is not — every provider's requests go to the site's model relay (§6). A turn
  needing a model name the running server lacks restarts the server when no other turn runs on it, and
  otherwise fails with a message asking to run it again.
- **OpenCode runs only in an agent container.** Its commands can only be contained where the launcher
  is, so a site running without container isolation refuses OpenCode runs; Claude still runs there.
- **A container that never runs an OpenCode turn never starts one.**

### Claude: one process per conversation

**One `claude` process per live conversation**, fed each turn through streaming input: `query()` takes a
stream of user messages (`prompt: AsyncIterable<SDKUserMessage>`), the process stays alive, and each turn
is one more message. This is the SDK's ordinary `query()`, not its alpha pool of warm processes
(`prewarm`/`claim`), which shares processes between sessions whose tools and hooks must be identical.

- **What is per turn stays per turn:**
  - the platform token, for tools and for git credentials (`AGENTHIX_MCP_KEY`), is the conversation's
    token re-pointed at each turn's capability (§2);
  - the gate hook runs in the site's own process and reads the current turn's context;
  - the model is set per turn with `setModel()`, and the run records the model the SDK reports for the
    turn (its `system/init` message), not the id requested: the CLI renames retired ids, differently
    between versions, so today's `model: context.model` can name a model that did not run;
  - a cancel is `interrupt()`, which ends the running turn within milliseconds and keeps the process for
    the next message. The query's `abortController` ends the process, never just a turn.
- **Every control call is awaited and its rejection handled.** Once the process has ended,
  `interrupt()` and `setModel()` reject, and an unobserved rejection ends the site with every running
  turn: site installs no handler, and Node's default is to exit. Today's cancel calls `interrupt()` in a
  `try` that cannot catch a rejected promise, and a cancel arriving after the turn's process exited
  reaches it.
- **What is fixed at start is checked at every turn.** The tool list, blocked tools, system prompt,
  skills and how the process authenticates (an API key or a subscription) are fixed for the process's
  life; which key is not, since the relay adds the current turn's to each request. At the start of each turn the site
  builds them for the turn; if they differ from what the running process started with, the process is
  replaced and the new one resumes the conversation from its session file. The key is never in the
  process's environment or the container's: the process's `docker exec` carries a one-use ticket, and
  Claude Code's `apiKeyHelper` setting trades it with the site once, when the process starts — for a
  relay token, not the key: `ANTHROPIC_BASE_URL` points at the site's model relay (§6), which adds the
  key, so the key never enters the container. A subscription is not relayed: its credential must be in
  the client, and Anthropic forbids a relay holding it (§6).
  A second request with the same ticket gets nothing, so a transient `401` costs that turn and the
  process is replaced at the next. The system prompt is compared whole, and a chat's carries the agent's
  agenda and memory files, so editing either replaces the process at the next turn (about 0.25 s). A subscription's credential file is not fixed: the running
  process reads it again on its next request.
- **Recycled at a memory ceiling.** The vendor's guidance is that memory grows with session length and
  subprocesses should be recycled. A process's memory is measured in the background after each turn that
  reached its result, so no turn waits on it; at the start of a turn, a process last measured above
  `AGENT_HARNESS_MEMORY_MB` (a machine setting beside §3's, 1,024 MB by default — the vendor's suggested
  starting allowance per agent) is replaced the same way. Small turns grew a process about 2–3 MB each.
- **Ended with the conversation's other processes** (§3): it carries the conversation's tag, so the idle
  timer and the conversation's end stop it. The next turn resumes after the existence check (adr-0076).
- **A site restart ends the `docker exec` holding it**; the next turn resumes.
- **No process starts where its commands cannot be contained**: before starting `claude` in a container,
  the site makes the same Landlock check as for OpenCode ("Keeping the gate whole", item 3).

**Verified against a stand-in model server** (SDK 0.2.141): over fifty turns of one process the gate hook
fired for every tool call with the current turn's context, the platform-tool connection served every
turn, and `setModel()` took effect from the next request. The CLI's own token refresh, and a shared subscription's refresh in hq, could not
be exercised. The SDK always runs the CLI with streaming input, so `interrupt()` stops even a
single-message turn.

### Options weighed with the owner

- **A new harness process per turn, for both.** Rejected: 2.4 s on every OpenCode turn, and Claude
  outside its intended mode.
- **Warm only where starting costs a second or more** — OpenCode warm, Claude per turn. Briefly the
  decision; rejected once each vendor's guidance was read: it runs Claude in the mode reserved for
  one-shot, stateless work, and gives up queueing a message sent while a turn runs.
- **`opencode run` per turn.** Rejected: it answers every permission request itself, so the per-call gate
  cannot sit between the model and the tool. **`opencode attach`** is not an alternative: it is a
  terminal client of a server that must already be running.
- **A warm spare OpenCode server per container**, given a turn's secrets on arrival. Rejected: the same
  memory as one server, more machinery, and still a start per turn behind the scenes.
- **One Claude process per turn with a per-run server for OpenCode** — first proposed, because a shared
  server seemed to mix runs' tokens, keys and approvals. Each has an answer (§2), and approvals do not
  carry over because the gate replies "once".

## 2. Permissions are live — approved 2026-09-28

A conversation's permissions are **read at the start of every turn**. A resumed conversation picks up
the current set, and so does every turn in between. A turn already running finishes on the set it
started with. It holds for both runtimes: a warm harness serves many turns, so its token is the
conversation's, re-pointed at each turn.

- **Each conversation gets its own platform-tool connection** on the shared server, added with
  `POST /mcp` when its first turn runs, named for the conversation, with an opaque token of its own. A
  server restart drops every such connection, so the site adds each again before the conversation's
  next turn.
- **Each conversation sees only its own connection.** A connection is named `agx` and the first 12
  hexadecimal characters of a hash of the conversation id — short, because some providers cap a tool's
  name at 64 characters, and free of `_`. The session is created with rules that deny every connection
  (`agx*`, pattern `*`) and then allow its own (`<connection>_*`); the last matching rule wins, so the
  rules never change when another conversation joins the server. Two conversations whose names collide
  on one server are refused, never merged. Verified: a deny whose
  pattern is `*` removes those tools from the list the model receives, for platform and built-in tools
  alike (`session/llm/request.ts:208-214`). A narrower deny — a pattern other than `*` — leaves the tool
  listed and refuses it on call.
- **The conversation's token points at the current turn's capability.** The token is a reference the
  site resolves (`runTokens.ts`); at the start of each turn the site points it at that run's capability,
  which hq signs per run as today, and at the end of the turn at nothing. Audit stays per run, and hq
  issues nothing new.
- **Between turns the token resolves to nothing.** A process a conversation left running (§3) can use
  its own files and network, but cannot act through the platform.
- **The connection's tool names carry the connection's name**: `<connection>_<tool>`, each part with
  anything outside `[a-zA-Z0-9_-]` turned into `_` (`mcp/catalog.ts:117-119`); the permission key is
  that full name, and the gate sees the same name. `_` may appear inside either part, so the mapping removes the prefix by the known
  connection name, and connection names are chosen to stay distinct once sanitised.
- **Provider keys stay on the site.** Each model request carries the session's current turn's relay
  token, set by Agenthix's plugin, and the site's model relay adds the key (§6). OpenCode chooses the
  model on each message, so one server may serve several providers; neither the server nor the container
  holds a key, and nothing restarts or waits when a turn's provider differs from the last.

**Options weighed with the owner:** permissions fixed for the server's life (rejected — hq would sign a
new kind of capability per container, and changes would wait for a restart); fixed per conversation
until it is resumed (rejected — the site would have to keep a capability alive past its run, and a
removed permission would keep working until the next resume).

## 3. A process belongs to the conversation that started it — approved 2026-09-28

The reset that ran when a container's last run ended — `kill -9 -1` and a wipe of the scratch folders
(`containerScratch.ts`) — is **removed**. It was built for a container shared by everyone in a project,
where one person's leftovers reached the next person's run; since person-scoped execution the next run in a container is
always the same runner's, and the reset only kills what a person meant to keep running. It would also
kill the long-lived server.

Instead, **a process belongs to the conversation that started it**, and ends with it:

- **Tagged.** Every process a conversation starts carries `AGENTHIX_SESSION=<id>` in its environment,
  and everything it starts inherits it — through `nohup`, `setsid` and a double fork alike (verified).
  A process started with `env -i` or `env -u` loses it and is left running, bounded by the container's
  limits and idle removal (adr-0083's accepted risk). A Claude turn gets the tag on its `docker exec`.
  OpenCode sets it per command through our plugin's `shell.env` hook, which is given the session id and
  overrides the server's own environment (`tool/shell.ts:416-425`); the plugin loads with
  `OPENCODE_DISABLE_DEFAULT_PLUGINS` set, which skips only OpenCode's built-in plugins. **The server
  itself carries no tag**: a process takes its tag from whoever starts it, so a server started by one
  conversation's `docker exec` would die with that conversation.
- **Found and killed as the image's user.** One pass reads every process's environment for an exact
  match (so one id is never taken for another it prefixes), stops the matches with `SIGSTOP` so they
  cannot fork, kills them, and repeats until a pass finds none, up to a limit. It runs as the image's
  user, the default for `docker exec`: root in these containers cannot read another user's process
  environment. A fork loop of 1,500 processes was cleared in two passes, other conversations untouched.
- **PID 1 reaps.** Containers start with `docker run --init`. Today's PID 1, `tail -f /dev/null`
  (`containerRunArgs.ts`), never collects exited children, so killed processes pile up as zombies against
  the container's process limit until nothing — `docker exec` included — can start.
- **An idle timer per conversation.** It starts when a turn ends and restarts when the next turn starts;
  a running turn is never idle. When it expires, every process carrying the conversation's id is killed.
  The conversation stays resumable — its next turn simply starts without them.
- **Also killed** when the conversation ends: closed (adr-0076), deleted, or its person leaving.
  Archiving does not end a conversation; the idle timer releases it like any other.
- **Released in this order:** the conversation's platform token is revoked, so nothing still running can
  act through the platform; the runtime is told, so a harness can close gracefully — a `claude` process
  saves its session file as it exits; the finder ends every process still carrying the tag; and the
  conversation's staging folder is removed once nothing can be reading it.
- **A heartbeat's fresh session is released when its pulse ends**, before its single-use container is
  removed, so no timer fires later against a container that is gone.
- **After a site restart** the site no longer knows the conversations it was keeping. Their tokens are
  revoked and their runtimes told by name when they end, but processes in a container the site took over
  at start live until that container is recreated or removed as idle (an open risk).
- **A cancelled turn stops only itself**: OpenCode's `POST /session/:id/abort`, or `interrupt()` on the
  Claude conversation's process, which ends the turn and keeps the process (§1). The run is recorded as
  CANCELLED; text the turn produced is kept as its reply, and a turn with none records "Stopped.".
- **Never killed by a conversation's timer:** other conversations' processes, and the OpenCode server
  while any conversation it serves is live — it stops when the last of them goes idle (§1). A Claude
  conversation's own process is one of its processes, and ends with them. A preview held open keeps its
  conversation's processes alive, as it is exempted from the reset today.
- **The container** is still removed after `AGENT_CONTAINER_IDLE_MINUTES` with no runs (adr-0049),
  which clears everything left in it, scratch included.

**The idle time is a machine setting.** `AGENT_SESSION_IDLE_MINUTES`, 30 minutes by default, in the
site's environment beside `AGENT_CONTAINER_IDLE_MINUTES` and the container limits (`containerLimits.ts`).
It protects the machine, so it belongs to the machine's owner — not to an agent's author and not to hq,
which has no authority over the machine a site runs on. The host-management milestone brings it
under the host-management capability with the machine's other resource settings, and the site permission layer covers hq or
project policy narrowing it.

**Why.** A background process that outlives its turn — a dev server, a watcher — is how people work on
their own machines, and a long-lived server is the first thing Agenthix runs that is meant to outlast a
turn. The per-turn reset was a stand-in for knowing which conversation started what; it worked only
because nothing was meant to last.

## 4. What person-scoped execution settled for OpenCode

- **State lives in the runner's harness home**, bound whole at `/home/appuser`, so `opencode.db` and
  `~/.local/state/opencode/` sit beside Claude's `.claude/` with no mount of their own; only OpenCode's two
  configuration folders are mounted over it ("Keeping the gate whole"). Several servers on one home were
  run at once in the person-scoped execution spike without corruption.
- **Container paths are ids** (`/projects/<id>/…`), so a session's recorded directory stays valid across
  renames, and OpenCode's undo snapshots, keyed by that path, keep working.
- **The working directory is the `directory` query parameter** of `POST /session`, not a body field —
  a body field is silently dropped. It is passed on every request.
- **The existence check** (`AgentRuntime.sessionExists`) is `GET /session/:id`: `200` exists, `404`
  gone. A server that is starting either refuses the connection or accepts it and never answers — both
  were seen — so every request has a time limit, and only a `404` means gone. Until the server answers,
  the check retries; it never reads silence as absence. A server the check starts is kept when it finds
  the session, for the turn that follows, and stopped when it finds none or fails, or when the run is then
  refused before its turn begins, unless another conversation holds it.
- **One writer per session** comes from the per-session run queue (adr-0075). Several conversations run
  at once on one server.
- **A conversation keeps its runtime** (adr-0078): the site runs OpenCode for any conversation that
  started on it, whatever the agent is set to now.
- **Nothing a signed-in account brings along** (adr-0080). OpenCode's equivalents — its own account
  login, OAuth-connected MCP servers (`mcp-auth.json`), provider logins stored in `auth.json` — are
  turned off or refused: `auth.json` is never read, and no server starts on a home holding an account
  ("Keeping the gate whole").

## 5. Scope — approved 2026-09-27, confirmed 2026-09-28

### In scope

- The OpenCode runtime behind `AgentRuntime`: the server lifecycle (§1), event translation, the
  existence check, and all three run kinds — **task runs, chat and heartbeats**.
- **The per-call authorization gate, audit logging and tool-name mapping, before any real agent runs on
  OpenCode.** The first build phase runs OpenCode only under test.
- **Each harness run the way its vendor intends** (§1): OpenCode's server per container, and one Claude
  process per conversation through streaming input, with its memory ceiling.
- **Skills per session through Agenthix's OpenCode plugin** (§7).
- **The harness's own to-do list allowed in both runtimes** — fixing the Claude gate's block on
  `TodoWrite` ("Tool-name mapping").
- **Live permissions** (§2) and **conversation-owned processes with the idle timer** (§3), including
  removing the per-turn reset for Claude runs too.
- **hq's credentials extended to other providers** (§6): OpenRouter, OpenAI, Google, Anthropic by API key,
  and an OpenAI-compatible endpoint. Integrating any open-source harness needs it. Usage attribution,
  usage governance and logins other than API keys stay deferred.
- **Web search on OpenCode as a platform tool served by the site**, with the org's Exa key ("Tool-name
  mapping").
- **The container test as the first build phase's acceptance check** (plan task 1.8, run as 3.1):
  OpenCode in the agent container with a named free OpenRouter model known to handle tool calls, and a
  second to fall back to, because a free model's shared pool can be rate-limited at any moment; the
  platform's tools attached, a kill, and a resume. **Passed 2026-09-29** on `qwen/qwen3.8-27b:free`,
  with OpenRouter's free router `openrouter/free` — already in OpenCode's catalogue — as the fallback,
  behind a proxy that allowed only `openrouter.ai`.
- **How it really works, written up at the end.** The last phase writes what the build learned into the
  living documentation, describing the system as built: `docs/architecture/tools/` beside
  `claude-tools.md` and `tool-control.md`; the runtime's architecture, including how a harness is driven
  and kept warm; and how skills reach each runtime, in `docs/concepts/skills/`. The OpenCode plugin's own
  header says why it replaces the `skill` tool and points to that documentation.
- **The cutover is a rename, not a migration**: `'native'` becomes `'opencode'` in `hq/schema.prisma`'s
  comment, `agentPackageService.ts`'s `RUNTIMES` and `runLaunch.ts`; `NativeRuntime.ts` is deleted; no
  rows are converted.

### Out of scope

| What | Why |
|---|---|
| Subagents | A capability not yet scoped. OpenCode's `task` tool is denied by permission rule; agents create platform sub-tasks with `create_task` as today. On Claude, native subagents are effectively available only to unrestricted agents, since the `Agent` tool is never in the permission-mapped set |
| Usage attribution and governance across providers | Deferred with the single-harness proposal's downstream questions |
| Logins other than API keys for other providers | Deferred |
| hq or project policy narrowing the idle time | The host-management milestone |

## 6. Provider credentials — approved 2026-09-29

**Today** each run gets one credential, chosen by hq (`resolveRunCredential`,
`hq/src/server/identity/modelCredential.ts`, adr-0060): the run's own boundary first, then the org's —
a person's run takes theirs, a project's run the project's, a heartbeat the org's only. It is Anthropic
only: an API key or a Claude subscription (`RunCredential` in `core`), stored in `ModelCredential` for
people and projects and in the `Provider` row `('llm', 'anthropic')` for the org.

**Providers in the first release:**

| Provider | Credential | Why |
|---|---|---|
| OpenRouter | API key | One key reaches hundreds of models, free ones included |
| OpenAI | API key | A direct provider people most often already have |
| Google (Gemini) | API key | The same |
| Anthropic | API key on OpenCode; API key or subscription on the Claude runtime, as today | A Claude agent can run on either runtime |
| OpenAI-compatible endpoint | Base URL, and an API key if the endpoint needs one | Models on a person's own machine or server — Ollama, LM Studio, a self-hosted server — for anyone keeping data off third-party services |

Every other provider OpenCode bundles can be added later without changing this design. The rendered
configuration names the enabled providers (`enabled_providers`), so adding one means adding it there;
that setting also turns off OpenCode's own hosted provider, which is otherwise on by default with free
models and no key (`provider/provider.ts:185-205`).

- **Every credential has a provider.** `ModelCredential` gains a provider, and its uniqueness becomes
  owner, provider and kind; it also gains a base URL for an OpenAI-compatible endpoint. The org's keys
  stay `Provider` rows, one per provider (`('llm', <provider>)`). `RunCredential` carries the provider,
  and the base URL where there is one. Existing rows are Anthropic's; nothing is converted (pre-release,
  no migration).
- **Resolution is unchanged, per provider.** hq resolves the credential for the provider of the turn's
  model by the same rules: the boundary's own, then the org's. A subscription is still Anthropic's only,
  used only by the Claude runtime, and only once its terms are accepted.
- **Settings → Model Access** takes a key per provider at the org, the project and the person, and the
  org's Exa key for search, stored in hq as the org's model keys are ("Tool-name mapping"). The Exa key
  is sent with OpenCode turns only; Claude keeps Anthropic's own search.
- **The key never enters the container.** Every provider's address in OpenCode's configuration is the
  site's **model relay** (`/api/v1/model-relay/<provider>/…`). The plugin asks the site's turn endpoint
  (`POST /api/v1/harness/turn`) for the OpenCode session's current turn — the conversation's id, its
  platform token and a **per-turn relay token** it sets as a header on each model request through
  `chat.headers` — authenticated by a key the site generates for each server and gives it at start
  (`AGENTHIX_HARNESS_KEY`), which the launcher strips from commands. Between turns the answer is no turn.
  The relay checks that the token names a running turn, that the request comes from that turn's
  container, and that the turn has a credential for the provider; it never takes the upstream address
  from the request (a built-in provider's is fixed, a compatible endpoint's is the credential's base URL).
  It then removes every credential header, sets the key in the provider's own header — `Authorization`
  for OpenRouter, OpenAI and a compatible endpoint, `x-api-key` for Anthropic, `x-goog-api-key` for
  Google — and streams the request and the response through unbuffered, passing status and headers
  (`retry-after` included, so OpenCode's own retries work). It logs one line per request: conversation,
  run, provider, model, status, bytes and timings, never a key, token or body. A provider with no key
  configured sends no request at all, so each still carries a placeholder key, which the relay replaces.
  Measured in a spike: about 0.5 ms more per request and 1.2 ms more to the first streamed token. A
  person's own endpoint is now reached from the site, not the container.
  The relay honours the site's proxy settings: `HTTPS_PROXY` for an `https:` provider, reached through a
  `CONNECT` tunnel so the key stays inside TLS and the proxy sees only the host, and `NO_PROXY`
  (`localhost`, `127.0.0.1` and `::1` always direct). An `http:` provider — a person's own endpoint over
  plain HTTP — never goes through a proxy, which would receive the key in clear; it is reached directly,
  so a site with no direct route cannot reach one.
- **Every provider the turn may use has its credential.** hq resolves one for the turn's model and for
  each fallback model's provider, by the rules above, and the dispatch carries them as a set; the relay
  picks by provider.
- **Claude with an API key goes through the same relay**, through `ANTHROPIC_BASE_URL` — Anthropic's
  documented gateway pattern — with the relay token from `apiKeyHelper` (§1). **A subscription never
  does.** Anthropic's legal and compliance page (code.claude.com/docs/en/legal-and-compliance, read
  2026-09-30) says developers "may not collect, store, or intermediate Claude.ai credentials or session
  tokens"; its gateway documentation describes a subscription only as passing through with the login in
  the client. Whether Agenthix's stored subscriptions are permitted at all is its own issue, which blocks release.
- **An agent on OpenCode names its model with its provider** (`openrouter/…`, `openai/…`), which is how
  OpenCode addresses models and how hq knows which provider's credential to resolve.
- **The model picker's lists are generated into `core`** from the pinned OpenCode version's model
  catalogue: OpenCode's filtered to the providers above, and Claude's from its `anthropic` entries under
  bare ids, with each model's cost rank, price band and price taken from the catalogue — so the "equal or
  cheaper" rule for model overrides works on both runtimes, and one price table costs runs in hq and the
  UI. Each runtime's default model is set once in `core` (`claude-sonnet-5`, `anthropic/claude-sonnet-5`). It is regenerated whenever
  OpenCode is upgraded, with the upgrade checks adr-0080 and adr-0081 require. An OpenAI-compatible
  endpoint takes a typed model name. hq and its sites ship from one release, so the list matches the
  image, and the picker works while a site is unreachable. (Rejected: the site reporting its catalogue
  over the control channel — the picker would fail whenever the site is down; a free-text model id — no
  cost rank, so no overrides.)
- **What OpenCode records of a turn's model** is the id as requested, OpenRouter's `:free` suffix kept.
  For a router id such as `openrouter/free`, which model answered is not visible to the site. The cost
  it reports is the catalogue's price times the tokens (`session/session.ts:338`), not the provider's bill.

**Options weighed with the owner:** keys in the server's environment at start, restarting the server on
any change — rejected: a turn needing a provider the server was not started with would wait for every
OpenCode turn in the container, and an agent can read its server's environment through `/proc` as easily
as a file in its home. `PUT /auth/:provider` per turn, the design until the acceptance check — rejected:
a running server keeps the key it read when it built the project folder's state
(`provider/provider.ts:1400`); a new key takes effect only after `POST /instance/dispose`, which cancels
every running turn in the folder, drops its platform-tool connections and ends the event stream. For
providers: the four direct ones alone (rejected — no path for models on a person's own hardware); every
bundled provider (rejected — each costs a settings entry, a model list and a test, for providers few would
use at first).

## 7. Skills — approved 2026-09-29

Recorded in adr-0084.

**How skills reach a model, in either harness.** Two steps. The system prompt lists each available
skill's name and description; when a task matches one, the model calls the `skill` tool with its name,
and the tool returns the skill's full instructions (`SKILL.md`) and where its files are. Claude Code and
OpenCode both work this way (`session/system.ts`, `tool/skill.ts` in OpenCode).

**How Claude gets them.** Each turn stages its skills into a folder of its own under the runner's home —
`.tmp/skills-<random>/.claude/skills`, bound read-only into the container (`stageTurnSkills` in
`claude/claudeSkills.ts`, `stageSkills` in `skillStaging.ts`). The folder is a local Claude Code plugin
named `agenthix` (`.claude-plugin/plugin.json` beside `skills/`), passed to the process with the SDK's
`plugins` option and an allowlist of the staged names (`skills`), and the `Skill` tool is given to every
agent. Claude Code reads no project settings (`settingSources: []`), so it loads skills from nowhere else,
and the allowlist hides its bundled skills. Its list labels each skill `agenthix:<name>`; the model calls
it by the plain name, and `/name` works. The gate logs each load as `skill`, needs no permission for it,
and refuses a name that was not staged. Each source keeps its own namespace — `platform-`, `org-`,
`agent-`, `boundary-`, `shared-` — so two sources with one name both reach the run. The folder belongs to
one process, so to one agent: agents never see each other's skills.

**A staged skill's header is rebuilt, for both runtimes** (`skillFrontmatter.ts`). Its body is kept as
written; its front matter keeps only `name` (the staged name), `description`, `when_to_use`,
`argument-hint`, `disable-model-invocation` and `user-invocable`, each value quoted. Every other key —
`hooks`, `allowed-tools`, `model`, `context`, `agent` and plugin-level keys among them — is dropped,
since a harness would act on it outside the gate and boundary skills are written by agents. On Claude,
a skill's inline shell is also switched off (`disableSkillShellExecution`).

**Why OpenCode's own skills do not fit a shared server.** OpenCode discovers skills once per working
directory into one pool keyed by name, and caches it (`skill/index.ts`); its per-agent support is a filter
over that pool. So two agents' skills with one name cannot both exist in a directory, and changing an
agent or a skill means discarding that directory's state, which cancels every turn running in it
(`config/config.ts`, `session/run-state.ts`). It is designed for one person's fixed agents in one
project; a shared server would need per-agent prefixes on skill names and a reload at each quiet moment.

**Skills reach an OpenCode session through Agenthix's plugin, per turn:**

1. **Staged per session, per turn.** At the start of each turn the site stages the run's skills with the
   same code as Claude (`stageSkills`, same namespaces and path checks) into a folder for that session
   under the runner's home, bound read-only. No per-agent prefix is needed: skills keep the names they
   have on Claude.
2. **The list goes in the turn's system prompt.** The site sends each skill's name and description in the
   message's `system` field, in the same words and format OpenCode's own list uses.
3. **Our plugin replaces the `skill` tool.** OpenCode documents that a plugin tool with a built-in tool's
   name takes its place, and a plugin tool is given the calling session's id. Verified: the model
   received only the plugin's `skill`, and calls ran the plugin's code — because plugin tools are listed
   after built-ins and the later one wins (`session/tools.ts:99`), an implementation detail. Our `skill`
   tool reads only that session's folder, passes the gate like every tool (with the skill's name as its
   argument), and returns the same `<skill_content>` output as the built-in.
4. **One OpenCode agent serves every Agenthix agent.** An agent's prompt and model arrive per message; its
   tool limits come from the session's rules and the gate. Nothing is defined up front and nothing is
   reloaded.
5. **OpenCode's own discovery is unused.** `OPENCODE_DISABLE_PROJECT_CONFIG` stops it reading
   `.opencode/` folders in the project, and the two configuration folders it always reads in the home
   are ones the agent cannot write ("Keeping the gate whole"), so nothing an agent writes becomes a skill.
   OpenCode always lists a built-in skill, `customize-opencode` (`skill/index.ts:278`), in a section it
   prints unless the agent-level rules deny `skill` (`session/system.ts:107-118`). So the configuration
   denies `skill`, removing that section, and each session's rules allow it again, keeping our tool
   listed (verified with `ask`; the gate is the plugin's, so `allow` is enough). The turn's own list is the only one the model sees.
6. **The staging folder goes** when the conversation goes idle or ends (§3).

The plugin is Agenthix's one OpenCode plugin, shipped read-only in the image and loaded from the
configuration. It also asks the site before every tool call (gate item 3), sets the `shell.env` tag
(§3), keeps the server's secrets out of commands' environment ("Keeping the gate whole"), sets each model
request's key (§6), and replaces OpenCode's file tools ("Tools Agenthix owns on OpenCode"). A command
with no turn running is refused, so nothing runs untagged.

**At every OpenCode upgrade**, our tool and list are compared with the built-in ones as part of the
checks in "Tools Agenthix owns on OpenCode".

**Options weighed with the owner:** OpenCode's native per-agent skills — one OpenCode agent per Agenthix
agent, prefixed names, a reload at each quiet moment (rejected: renamed skills, and changes and new agents
wait for a reload); a platform tool `load_skill` on each conversation's tool connection (rejected: a
network hop per load, and a tool name models do not expect); a server per agent (rejected: 0.3–0.7 GB per
agent, and the same caching).

## 8. Run kinds — 2026-09-29

All three run kinds — chat, task runs and heartbeats — run on OpenCode before this unit is done (§5).

- **Chat** is §1–§3. OpenCode takes the system prompt, the model and the agent on each message
  (`POST /session/:id/message`: `system`, `model`, `agent`), so one shared server serves every agent in the
  container with nothing defined per agent.
- **Task runs** run in the project's own container (adr-0074), on that container's server. Each task's
  session is its own conversation under the same rules as chat.
- **Heartbeats** keep their per-agent, single-use container until a later change gives them a boundary, and every
  pulse starts a fresh session, so on OpenCode a pulse starts its own server — about 1.3 s per pulse as
  built.
  **Accepted:** adr-0081 keeps a harness warm so conversations are quick, and a heartbeat has no
  conversation to keep and nobody waiting on it. A pulse's server runs beside any warm server in the
  person's or project's own container, with its own home and state. When a heartbeat moves into its
  boundary's container, it uses that container's warm server and the per-pulse start goes away.
- **Nothing else depends on the runtime.** Title generation, memory and the other conversation features
  call no harness directly.
- **Agenthix titles OpenCode's sessions.** A session is created with Agenthix's title for the
  conversation — the first words of its first message (`site/src/sessions/namingService.ts`) — and
  OpenCode makes its own title call only for a session still carrying its default title
  (`session/prompt.ts:200`). That call would use `small_model`, or else the provider's newest small model,
  which may cost more than the agent's own (`provider/provider.ts:1939-1990`); so no `small_model` is
  needed. A title written by a model may be a later feature.

## Tool-name mapping — approved 2026-09-29

Agenthix's canonical tool vocabulary (`read_file`, `write_file`, `edit_file`, `glob_files`,
`grep_files`, `bash`, `web_fetch`, `web_search`, and the platform's own tools) is translated to and from
Claude's names in one file, `sdkNames.ts`. OpenCode gets the same shape in `openCodeNames.ts`.

**The gate sees each call by its tool name, with its arguments.** Agenthix's plugin receives every call
in `tool.execute.before` as the tool's own id — `edit` and `write` apart, a platform tool as
`<connection>_<tool>` — and the call's full arguments (`session/tools.ts:106-110`, `:401-405`), so the
gate translates the tool directly. OpenCode's permission keys, which group `edit`, `write` and
`apply_patch` under `edit`, are not used. Call ids are in each provider's own format, and treated as
opaque strings.

| OpenCode tool | Canonical | Treatment |
|---|---|---|
| `bash` | `bash` | Gated, with bash patterns as today |
| `read` | `read_file` | Gated. **Agenthix's own** ("Tools Agenthix owns on OpenCode") |
| `glob`, `grep` | `glob_files`, `grep_files` | Gated. OpenCode's own, running `rg` through the launcher |
| `edit`, `write` | `edit_file`, `write_file` | Gated. **Agenthix's own** |
| `apply_patch` | `edit_file`, plus `write_file` when a patch adds, deletes or moves a file | Gated, on the patch text. **Agenthix's own.** It replaces `edit` and `write` on GPT models (`registry.ts:297`) |
| `webfetch` | `web_fetch` | Gated |
| `websearch` | — | **Off**: `OPENCODE_ENABLE_EXA` is never set. Search is the platform's own tool — see below |
| `skill` | — | **Replaced by Agenthix's plugin** (§7); every load gated and logged |
| `todowrite` | — | **Allowed, and logged** — the agent's private checklist for the conversation |
| Platform tools, `web_search` and `stop_processes` among them | the tool's own name | The per-conversation connection prefix `<connection>_` is removed by the known connection name (§2) |
| `task` | — | Denied, and hidden from the model: no subagents (§5) |
| `question` | — | Denied, and hidden. On by default under `serve`, because OpenCode takes its client to be the terminal unless `OPENCODE_CLIENT` says otherwise |
| `lsp`, `plan`, `execute` | — | Off: each needs an experimental flag Agenthix never sets. **Code mode (`execute`) must never be enabled** — it runs platform tools from a script, outside the per-call gate |

Paths outside the working directory are judged by the gate like any other argument; OpenCode's own
`external_directory` prompt is allowed, since the container mounts only the boundary and the whole
boundary is reachable (adr-0079).

**A harness's to-do list is not a platform task.** `TodoWrite` (Claude) and `todowrite` (OpenCode) are
the agent's private scratchpad for one conversation; `create_task` makes a durable task on the platform.
Neither stands in for the other. The Claude gate blocked `TodoWrite` and `TodoRead` and pointed the agent
at `create_task`, while `sdkNames.ts` offered `TodoWrite` and the tool documentation
(`architecture/tools/claude-tools.md`) says to expose it — a contradiction found on 2026-08-15 and never
queued. **This unit fixes it for both runtimes:** `TodoWrite` and `TodoRead` leave the Claude gate's block
list (`ToolSearch`, `TaskOutput` and `TaskStop` stay blocked), OpenCode's `todowrite` is allowed, and the
Claude gate gets the unit test it has never had.

**Web search is a search service's, never the container's own crawling — and which service differs by
runtime.** Claude Code keeps its `WebSearch`, which runs on Anthropic's service as part of the model
request — billed to the API key's account, or included in a subscription — so the container makes no
connection for it. OpenCode sends no model vendor's search tool at all (checked in source); its own
`websearch` needs its hosted models or a third-party service switched on, whose key it reads once from
the server's environment (`tool/mcp-websearch.ts:4-6`). **On OpenCode, web search is a platform tool
served by the site**: `web_search` on each conversation's platform-tool connection, gated like every
platform tool, and offered only on a connection that says it is OpenCode's, so Claude never sees it
beside its own `WebSearch`. The site calls Exa's Search API with the org's Exa key, which hq stores as it stores the
org's model keys and sends to the site with each turn; it is never in the container, the harness's
environment or the home. OpenCode's own `websearch` stays off. The service behind the tool can be swapped
— SearXNG or Brave later — without changing the tool; the first release has Exa alone. So queries are
seen by Anthropic on Claude and by Exa, through the site, on OpenCode. Fetching a page is the container's
own on both runtimes; Claude Code also sends the page's hostname to `api.anthropic.com` for a safety check
first.

**The manifest parser's Claude names go.** `parseManifestFromOutput` and `KNOWN_SDK_TOOLS` in
`manifestParser.ts` have no caller outside their tests; the gate and the stored manifest already use
canonical names. The cutover deletes them rather than making them per-runtime.

## Per-call authorization gate — approved 2026-09-29, moved into the plugin 2026-09-29

The design below is the starting point; the owner expects it to be refined as the build learns how
OpenCode really behaves, and what is learned is written up at the end (§5).

**The gate is Agenthix's own on both runtimes, and OpenCode's permission system is not it.** OpenCode's
security policy (`SECURITY.md`, v1.18.32) says its permission system "exists as a UX feature … it is
not designed to provide security isolation", and that with server mode on, "any functionality it
provides is not a vulnerability". Its permission replies are an API call anyone holding the server's
password can make. So the gate is built as it is for Claude: Claude's own permissions are bypassed
(`permissionMode: 'bypassPermissions'`) and every call is decided by Agenthix's `PreToolUse` hook; on
OpenCode, its permissions allow everything and every call is decided through Agenthix's plugin.

1. **OpenCode never asks.** Agenthix's configuration and every session's rules set `"*": "allow"`,
   then deny with pattern `*` what the model must not see — `task`, `question`, other conversations'
   tool connections (§2), a restricted agent's `never` built-ins, and in a run with no approved manifest
   (a heartbeat) its `ask` built-ins and `ask` platform tools (`<connection>_<tool>`) — which removes those
   tools from the list the model receives (§2), and deny `skill` at the configuration level only (§7).
   OpenCode hides a tool by its permission key, and `edit`, `write` and `apply_patch` share `edit`, so the
   three are hidden only when both `edit_file` and `write_file` are withheld; otherwise the gate refuses
   the withheld one on call. Claude leaves the same tools out of its `tools` list and `disallowedTools`. A session's rules are brought up to the turn's at the start of every turn (`PATCH /session/:id`
   when they differ), since permissions are read per turn. Nothing ever waits on OpenCode's permission reply
   endpoint, and the site never calls it.
2. **One gate, two adapters.** The decision logic leaves `sdkToolGate.ts` for a runtime-neutral
   `toolGate.ts`: the manifest check, bash patterns, deferred-manifest collection, risk rating
   (`riskRating.ts`), the `ToolCallLog` write and the steering text. Claude's `PreToolUse` hook and
   OpenCode's plugin are thin adapters around it, so both runtimes enforce one set of rules from one
   piece of code, and the same permission prompts reach the person.
3. **The plugin asks the site before every call.** In `tool.execute.before` — which OpenCode runs before
   every built-in, plugin and platform tool call, with the session id, the call id and the full
   arguments (`session/tools.ts:106-110`, `:401-405`) — the plugin sends the call to the site and waits
   for the decision. The site:
   - maps the session to its conversation and current run — with no turn running, it rejects;
   - translates the tool (see "Tool-name mapping") and runs the shared decision on the arguments;
   - writes the audit row, with the call id as the tool-use id;
   - answers allow, or reject with the same steering text the Claude gate gives; the plugin then lets the
     call run, or throws the steering text itself, with no prefix. Verified for built-in, plugin and
     platform tools: the throw ends that call only — the hook's rejection becomes a defect
     (`plugin/index.ts:294`), but each tool runs through `Effect.runPromise` (`effect/bridge.ts:65`), so
     it surfaces as that call's tool error (`session/processor.ts:416`); only OpenCode's own permission
     and question rejections stop a turn (`:199-201`). The model receives the message verbatim. Parallel
     calls in one step are decided at the same time, each on its own; the hook costs about 0.3 ms plus
     the site's answer.
   The plugin reaches the site over the conversation's own platform-tool address, with the
   conversation's token (§2), so a decision is only ever the current turn's; the token is handed to the
   plugin each turn as the keys are (§6).

   **Stopping a turn ends its decisions first.** OpenCode does not cancel a hook that is still waiting,
   so a call the site allowed after a turn was aborted would still run, unrecorded. When a turn is
   stopped, the site ends the run and answers every decision still pending for it with a rejection, and
   only then aborts OpenCode's session; any later decision request for that run is rejected.
4. **Bash is judged on the whole command**, the `command` argument, against Agenthix's bash patterns as
   the Claude gate does. Every shell call reaches the gate, whatever OpenCode's own parser finds in it.
   On both runtimes, a `never` tool, `bash` in state `never` and a `never` bash pattern are refused in every
   run — a heartbeat's included, and whatever the run's manifest approves, `*` included. A run with no
   approved manifest — only a heartbeat — has nobody to approve anything, so on both runtimes a restricted
   agent's `ask` tools (a tool missing from its permissions counts as `ask`) are refused
   (`tool-ask-unattended`), and so is any command needing approval unless an `always` bash pattern matches
   it (`bash-ask-unattended`); `bash` stays listed only while such a pattern exists. The heartbeat's own
   tools, `fetch_my_queued_tasks` and `run_task`, are pinned `always` and run. This holds until heartbeats
   become routines owned by a boundary.
5. **It fails closed.** An error, a timeout, an unknown tool or an unknown run is a rejection with a
   message. OpenCode puts no time limit on the hook — a 65 s decision completed — so the plugin's own
   deadline on the site call is the only one, and its expiry is a rejection.
6. **The gate is only as strong as its separation from the agent's terminal.** On both runtimes the
   gate's enforcing end — the `claude` CLI, OpenCode's server and plugin — runs in the container as the
   same user as the commands the agent runs ("Keeping the gate whole", item 3). So every command runs in
   a Landlock sandbox that cannot reach the harness, and the harness's own file tools, which run inside
   the harness, are refused the harness's home (`/home/appuser/**`) and `/proc/**`, judged on real paths
   so a symbolic link the agent planted cannot lead there. The real path is resolved in the container
   before the decision, and the harness opens the file after it, so a command can still swap a checked
   path for a link in between — the harness then acts as the agent's confused deputy. How that is closed,
   tool by tool, is "Tools Agenthix owns on OpenCode":
   - both gates hand the harness the checked real path in place of the one the model gave — Claude's
     `PreToolUse` through `updatedInput`, OpenCode's plugin by replacing the call's arguments — so only a
     swapped intermediate folder is left;
   - secrets are kept out of the harness's own environment wherever the harness offers another way —
     Claude Code's API key arrives through `apiKeyHelper`;
   - on OpenCode, Agenthix's own `read`, `write` and `edit` open the file first and then check what was
     opened, leaving no gap; `apply_patch` gets the same, and `grep` and `glob` run `rg` through the
     launcher.

## Keeping the gate whole — decided 2026-09-29

OpenCode's configuration carries authority over the harness — `plugin` loads code that runs inside the
server, `mcp` and `provider` redirect tools and model traffic, `permission` hides or shows tools. OpenCode assumes whoever edits it is the authority; in
Agenthix the agent writes the project and the home, and authority comes only from hq's signed capability
(adr-0060, adr-0082). Reading OpenCode's source found three more weaknesses in the gate as first
designed. They were not run: **they are assumed real, and each is closed by a control of Agenthix's
own**; the lanes test that each holds. OpenCode's security policy lists "malicious config files" and
"sandbox escapes" as outside what it protects, so these controls are Agenthix's to own.

1. **Configuration from places the agent can write.** OpenCode always reads `~/.config/opencode` and
   `~/.opencode`, whatever `OPENCODE_DISABLE_PROJECT_CONFIG` says (`config/paths.ts:23-41`), and each can
   supply configuration, plugins, tools, agents and skills (`config/config.ts:437-480`). Three more things
   in the writable home change where it connects or what it loads: the cached catalogue
   `~/.cache/opencode/models.json`, whose entries give a provider its address when the configuration does
   not (`packages/core/src/models-dev.ts:186-205`); a `wellknown` entry in `auth.json`; and an account in
   `opencode.db` — each of the last two makes the server fetch configuration from an address and merge it
   (`config/config.ts:370-410`, `:492-527`). Controls:
   - **Both configuration folders are ones the agent cannot write**: read-only binds, into the home, of
     one folder the site owns, which holds a `.gitignore`. OpenCode writes a `.gitignore` into each and
     forgives only a permission refusal, so a read-only folder *without* one fails every request
     (`config/config.ts:309-324`); with one already there, it writes nothing. Verified from the harness's
     own user: writing, removing and moving them all fail, and the server starts cleanly. (Owning them by
     another user, first proposed, is not possible: the site is not root.)
   - **`npm_config_offline=true`**: OpenCode otherwise runs `npm install @opencode-ai/plugin` in every
     writable configuration folder at every start — holding its first answer about 80 s when offline and
     a plugin is configured — and no OpenCode flag stops it (`config/config.ts:437-466`).
   - **`OPENCODE_MODELS_PATH` points at a read-only catalogue in the image**, so the home's cache is
     never read, and the configuration sets each provider's address.
   - **`auth.json` is never read**: the server starts with `OPENCODE_AUTH_CONTENT` set to an empty
     object, which OpenCode reads in its place (`auth/index.ts:59`). Should the file ever be used, the
     site deletes it when it stops a server and before it starts one; OpenCode leaves it behind.
   - **No server starts on a home whose `opencode.db` holds an account.** Agenthix never signs OpenCode
     into one (adr-0080).
2. **Rules from every source are merged, and the last match wins** (`permission/index.ts:28-38`), so
   another source's rule can come after Agenthix's. Since the gate is the plugin's, a rule can no longer
   approve a call; it can still show a hidden tool to the model. **Control:** every session's own rules
   begin with Agenthix's whole set, and OpenCode evaluates a session's rules after the configuration's
   (`session/tools.ts:87`), so they are final.
3. **The agent's terminal runs as the harness's own user.** Every shell command the agent runs, and
   everything it starts, runs in the container as the same user as the harness: OpenCode's server and
   plugin, or the `claude` CLI. Commands inherit the server's environment (`tool/shell.ts:416-425`), and
   even with the plugin's `shell.env` hook blanking a value there, a command can read the server's own
   environment through `/proc`, as the tag finder does (§3). That includes `OPENCODE_SERVER_PASSWORD`,
   which OpenCode reads only from its environment (`server/auth.ts:18`) and which opens the server's whole
   API — sending messages, running shell commands directly, adding tool connections. The `claude` CLI
   has no port or password, but a same-user process can reach it too. And every command a Claude run
   starts with an API key inherits `ANTHROPIC_API_KEY` today (verified).

   **Control: every command the agent runs is sandboxed with Landlock**, a Linux feature by which a
   process restricts itself and everything it starts, irreversibly and without privilege. A small
   launcher in the image is the shell both harnesses use — OpenCode through the `shell` key of its
   configuration, Claude Code through `CLAUDE_CODE_SHELL_PREFIX`, which keeps `cd` and Claude's own time
   limits working. Before running the command, the launcher removes the harness's secrets from its
   environment and restricts itself: no access to the harness's home, and signals, tracing and
   `/proc/<pid>/environ` limited to processes inside the sandbox. The command still runs as the same user,
   so file ownership, git, background processes, the tag (§3) and the process finder are all as they
   were. Chosen by the owner on 2026-09-29 from a spike that built it and three alternatives on both
   runtimes, each checked by reading the harness's environment and home and signalling and tracing it
   from a command:
   - **Landlock**: held every check with the site's container options unchanged; about 0.1 ms a command.
   - **A second user for commands**: held, but only with `no-new-privileges` off and a setuid helper, and
     it broke file ownership — files unpacked from archives could not be edited by the harness or cleaned
     up by the site, and git had to be told to trust the workspace. Kept as the fallback for a kernel
     without Landlock's newer features.
   - **bubblewrap**: needs Docker's system-call filter loosened, and background processes die with their
     command.
   - **Claude Code's own sandbox**: needs the same loosening, and still left the home and the API key
     readable.

   **Landlock depends on the host's kernel.** Blocking signals and tracing needs Landlock ABI 6 (Linux
   6.12); older kernels still enforce the file rules, but a command could kill the harness. The site
   checks at startup and runs no agent command without ABI 6. Docker Desktop's current kernel (7.0)
   has it; the supported kernels go into the deployment guide. Landlock does not hide file names in the
   harness's home, only their contents.

   Each command is its own sandbox, and signals between sandboxes are refused too, so a command cannot
   stop a process an earlier command started — a dev server from the last turn, say. The site serves a
   platform tool that does it instead: it stops the calling conversation's own processes, matched by the
   tag (§3) and never the harness, runs outside the sandbox through the process finder, and passes the
   gate like any other tool. The agent's prompt names it. Chosen by the owner on 2026-09-29, over telling
   agents they cannot, or dropping signal scoping and letting commands signal the harness.

   Commands use a home of their own, `/home/agent`, for git and package-manager settings, not the
   harness's; the launcher sets it on both runtimes. It lives in the container, so its settings go when
   the container is removed. A command may read folders inside the harness home only where the site names
   them, read-only, in `AGENTHIX_COMMAND_READABLE` — the staged skills, so a skill's scripts run; a name
   outside the home, or the home itself, makes the launcher refuse the command. The list of secrets the
   launcher strips is kept in one file in the image. The
   `shell.env` hook still blanks server secrets in commands' environment and turns `npm_config_offline`
   off again for commands, so an agent's own installs follow the site's network policy; no key is in
   the server's environment at all (§6, "Tool-name mapping").

## Tools Agenthix owns on OpenCode, and what each upgrade must check — decided 2026-09-30

Recorded in adr-0085. This section says which of OpenCode's tools run as OpenCode ships them and which
are Agenthix's own, why Agenthix took on the ones it did, and what that obliges at every upgrade.

**Why any tool is ours at all.** The gate decides a call on its arguments, and Landlock keeps the agent's
commands from the harness's home and secrets. Neither stops the harness itself being used as the agent's
**confused deputy**: the harness reads and writes files on the agent's behalf with its own permissions,
which include its home (`/home/appuser`: its database and state) and its own environment
(`/proc/self/environ`: the server password and the key that fetches each turn). A command the agent
runs may make a symbolic link — Landlock limits what a process opens, not where a link it makes points,
and refusing links outright would break npm, pnpm, Python environments and repositories that contain
them. So:

- **A link that is already there** when the gate looks is caught: the gate resolves the real path in the
  container and refuses the harness home and `/proc` (gate item 6).
- **A link swapped in after the check** is not: the gate checked a real folder, and a few milliseconds
  later the harness opens the same path, now a link, and reads or writes the other end with its own
  permissions. A read hands the model the harness's secrets as ordinary tool output; a write lands in the
  harness's home, which the controls in "Keeping the gate whole" assume the agent cannot write.
- **OpenCode also reads files the gate never sees.** When the model reads a file, OpenCode attaches the
  nearest `AGENTS.md` and `CONTEXT.md` in each folder between it and the project root
  (`session/instruction.ts`), by path, whatever `OPENCODE_DISABLE_PROJECT_CONFIG` says; no setting turns
  it off. A planted `AGENTS.md` link is read into the model's context with no race at all.

A second user for commands would not change this: the link is still followed by the harness, which may
read its own home and environment under any user. The fix has to change how the harness opens files, or
what the process opening them can reach.

**The tools, and whose code touches the files:**

| Tool | Whose | How it is made safe | Upkeep at an upgrade |
|---|---|---|---|
| `bash` | OpenCode's | Every command runs through the Landlock launcher (the `shell` key) | Confirm the key still routes every command |
| `grep`, `glob` | OpenCode's | They run no file access of their own: both start `rg`, found on the `PATH` (`packages/core/src/ripgrep.ts`), with the server's full environment. A small `rg` in the image, ahead of the real one on the `PATH`, runs it through the launcher: the secrets are stripped from its environment and the harness home is refused to it, so a swapped link leads to a wall | Confirm they still start `rg` from the `PATH` |
| `todowrite`, `webfetch` | OpenCode's | Touch no files | None |
| `skill` | Ours | Design, not security: each conversation sees only its own staged skills (§7) | Compare with the built-in's output |
| `read` | Ours | Opens the file first, asks the kernel what it opened (`/proc/self/fd/<n>`), refuses the harness home and `/proc`, and only then reads through the descriptor it holds. Does the same for each `AGENTS.md`/`CONTEXT.md` it attaches | Compare output, line cap, truncation and messages with the built-in |
| `write`, `edit` | Ours | The same, before writing; the edit matching is OpenCode's own code, copied under its MIT licence | The same, and re-copy the matching code if it changed |
| `apply_patch` | Ours | The same, per file the patch touches. OpenCode offers it to GPT models *instead of* `edit` and `write` (`tool/registry.ts:297`), so it is their only way to edit | The same, and re-copy the patch parser if it changed |
| `websearch` | Off | The site's `web_search` platform tool instead ("Tool-name mapping") | None to OpenCode |
| `task`, `question`, `lsp`, `plan`, code mode | Off | — | Confirm still off |

**Why Agenthix takes this on rather than leaving it.** The file tools are the part of a harness that
changes least — reading and writing files does not move with each new model — and they are small (about
1,350 lines, 550 of them OpenCode's matching code). OpenCode keeps what does move quickly: the agent
loop, the provider adapters and their per-model quirks, per-model prompts and tool choices, context
compaction and resuming sessions. Every other control is a setting, a hook, or one file in the image, and
leaves OpenCode's code as it ships (adr-0081). Leaving the file tools as they are would leave the
`AGENTS.md` hole, which no other control closes, and writes into the harness's home.

**On Claude.** Claude Code's `Read`, `Edit` and `Write` run inside the CLI and cannot be replaced
without leaving how its vendor intends it to run; the gate hands them the checked real path
(`updatedInput`), which narrows the gap to a swapped intermediate folder but does not close it — an open
risk. Its `Grep` and `Glob` would use a copy of ripgrep bundled in the CLI; `USE_BUILTIN_RIPGREP=0` on the
process's `docker exec` makes them use the wrapped `rg` on the `PATH` instead (verified in the image),
so they are contained as OpenCode's are. The launcher can be started from inside its own sandbox — a
command that runs `rg` — and then keeps the sandbox it is in rather than building another. The server's
`rg` cannot search the staged skills folders, which `read` and commands still reach. Its API key no longer sits in its environment: each process fetches it once, with a
one-use ticket, through Claude Code's `apiKeyHelper` setting (§1).

**Keeping the most valuable thing out of reach.** A confused deputy can only hand over what the harness
can reach. The turn's provider key was the most costly thing within reach — often the org's, usable
outside Agenthix. So model requests go through the site's model relay (§6), on OpenCode and on Claude
with an API key, and no model key enters the container: a harness holds only secrets scoped to
Agenthix — its server's password, its key to the site, and a relay token that works only from its
container, for its turn. A Claude subscription cannot be kept out: the relay does not hold one, since
Anthropic's terms say a product may not "collect, store, or intermediate" its credentials (§6).

**At every OpenCode upgrade** — alongside the checks adr-0080 and adr-0081 require and the model list
(§6):

1. **A comparison check** runs our `read`, `write`, `edit`, `apply_patch` and `skill` beside OpenCode's
   own on the same fixture files in the agent image and reports every difference in output, truncation
   and error text. Differences are either copied into ours or recorded as deliberate. The check is
   `site/opencode-plugin/src/__tests__/toolComparison.container.test.ts`; how to run it against a new
   image, and the differences Agenthix keeps with the reason for each, are at its top.
2. **The copied code** — edit matching, the patch parser — is compared with the new version's and
   re-copied if it changed.
3. **What the controls rely on is re-checked**: a plugin tool still replaces a built-in of the same name;
   `tool.execute.before` still runs before every call with its arguments; `grep` and `glob` still start
   `rg` from the `PATH`; the `shell` key still routes every command; no new tool opens files by path. A
   new tool that does is off until it is covered.
4. **The revisit triggers below** are read against what the upgrade cost.

**When to reconsider a harness of Agenthix's own.** Going native would not save this work — a harness of
Agenthix's own runs in the same container as the agent's commands and needs the same open-then-check
file tools, the launcher and keys kept out of reach — and it would add the loop and the providers back
(adr-0073). The choice is revisited when any of these holds:

- Agenthix finds itself replacing OpenCode's loop, compaction or provider handling, not only tools;
- upgrades keep breaking what the controls rely on, so that an upgrade costs more than the comparison
  check and a fix;
- the upstream v1/v2 split leaves the pinned line without a future ("Deployment and version pinning");
- a security gap appears that only a change inside OpenCode's own code could close.

## Deployment and version pinning

- **Pin the v1 line** (`opencode-ai`, `@opencode-ai/sdk`) at a specific version, installed in the agent
  image. The person-scoped execution spike, the benchmarks and the verification phase used 1.18.32. The parallel
  `@opencode/cli` v2.0.x line has no migration guide and no stated relationship to v1; do not build
  against it until that is resolved upstream.
- **Pin the image's Claude Code CLI** to the version the SDK bundles (its `manifest.json`); the image
  installs the newest today, and the two differ in small ways, such as how retired model ids are renamed.
- **Every provider Agenthix supports is installed in the image**, since `npm_config_offline` stops any
  being installed at runtime.
- **The model catalogue.** `OPENCODE_DISABLE_MODELS_FETCH` stops fetching it, at start and hourly; the
  binary carries the catalogue it was built with, so a site without outside access needs no file. The
  image still ships it read-only for `OPENCODE_MODELS_PATH` ("Keeping the gate whole").
- **Configuration is passed in the environment** (`OPENCODE_CONFIG_CONTENT`), rendered by the site from
  Agenthix's own settings for the agent and boundary, never read from a file an agent could edit.
  `OPENCODE_DISABLE_PROJECT_CONFIG` turns off the project's files, as `settingSources: []` does for
  Claude and as Anthropic's hosting guide recommends for multi-tenant use.
- **No outbound connection of OpenCode's own** (adr-0080). Through a logging proxy, the server by default
  reached `models.opencode.ai` and `registry.npmjs.org` at every start, GitHub at the first `grep` or
  `glob` (to download ripgrep) and `opncd.ai` when a session was shared, and nothing while idle, in a
  turn or on a resume. With these settings it reached nothing through a start, two minutes idle, two
  turns and a restart, and with a real provider only the provider:
  - environment: `OPENCODE_DISABLE_MODELS_FETCH`, `npm_config_offline=true`, `OPENCODE_DISABLE_SHARE`,
    and `OPENCODE_DISABLE_AUTOUPDATE` and `OPENCODE_DISABLE_LSP_DOWNLOAD` as second guards; never
    `OPENCODE_ENABLE_EXA`, `OPENCODE_ENABLE_PARALLEL`, `OPENCODE_EXPERIMENTAL`, `OPENCODE_AUTO_SHARE` or
    `OTEL_EXPORTER_OTLP_ENDPOINT`;
  - configuration: `share: "disabled"`, `autoupdate: false`, `enabled_providers` (§6), and no `lsp`,
    `formatter`, `skills.urls` or URL in `instructions`;
  - the image: `rg` on `PATH`, since no setting stops the ripgrep download.
- **The image needs no pre-created folders** for OpenCode's state: the whole home is bound, so the
  `EACCES` the spike hit binding a single folder does not arise.

## How it is built

The build runs as it did for person-scoped execution: **parallel lanes, each on its own branch and worktree, each worked
by a background agent**, with the lead as the bridge between them and the owner. The phases and lanes
are drawn in the implementation plan (task 2.4). The whole unit stays on one branch and merges to `main` once, at the end.

**Every agent is given the model its work needs, passed explicitly.** Opus where the work is a security
boundary, a race or a decision — the gate, live permissions, process ownership and the kill on idle, the
server lifecycle and its restarts, the decision records. Sonnet where it is bounded — the tool-name
table, the rename and deletion of `NativeRuntime`, measurements, documentation.

### Resource strategy

Written before any agent starts, and put in every agent's brief. The machine is a 24 GB, 10-core Mac;
six lanes and a spike on it at once caused memory and CPU spikes during person-scoped execution, and every OpenCode server
adds 250–550 MB.

1. **What agents contend for:** memory and CPU (typechecks, unit tests, Wasp compiles, OpenCode servers);
   the Docker daemon and its containers; the fixed ports and the shared test database; OpenRouter's
   free-tier rate limit; the same files where lanes meet.
2. **What runs one at a time:** every heavy command — `tsc`, `vitest`, `wasp compile`, the core build —
   through a machine-wide lock, with Node's heap capped (`--max-old-space-size=3072`) and
   `VITEST_MAX_WORKERS=1`; and one container at a time through the same lock, capped at
   `--memory 2g --cpus 2`, named with its lane and removed when done. No model calls in lanes: real
   models run only in the lead's acceptance check. Agents run the tests they touched while iterating and
   the full unit suite once before reporting; integration, cross-app and smoke suites run once, by the
   lead, after lanes are combined.
3. **How it is watched:** the lead monitors free memory, load and swap, alerting when free memory falls
   below 20 % or load stays above 10 for a minute, and again on recovery. Every command and wait has a
   time limit (`timeout`, `curl --max-time`, a deadline on every loop) — a wait without one hung the first
   measurement in this unit — and anything long runs detached and is polled. A report unchanged for 15
   minutes is checked, and containers a lane left behind are removed by name.
4. **When a limit is hit:** the least critical lane pauses first — documentation and measurement before
   code, Sonnet lanes before Opus. Containers are stopped before any heavy command is. The lead's own
   regression run is never the one stopped.

## Open risks carried into implementation

- **Landlock's strength depends on the host kernel** ("Keeping the gate whole", item 3). Below Linux 6.12
  the site runs no agent command; whether to offer the two-user fallback for such hosts is open.
- **Stopping a turn** must reject its pending decisions before OpenCode's session is aborted (gate
  item 3), until a lane test shows it holding.
- **The harness as confused deputy** ("Tools Agenthix owns on OpenCode"). On OpenCode the gap is closed
  for `read`, `write`, `edit` and `apply_patch`, and for `grep` and `glob` on both runtimes. On Claude,
  `Read`, `Edit` and `Write` stay narrowed but open.
- **Tools Agenthix owns drift from OpenCode's** at upgrades; the comparison check is what catches it.
- **The relay token is within the confused deputy's reach** during a turn. It works only against this
  site, from this container, for this turn's providers, and nothing between turns.
- **The relay's check of where a request comes from is weaker on Docker Desktop.** There every
  container's request reaches a site on the Mac host from `127.0.0.1`, so the check shows only that it
  came from this machine and the relay token alone ties it to the turn; where the site shares the
  containers' network — deployed, or on Linux — it matches the turn's container. Not yet run on Linux.
- **A person's own endpoint is reached from the site**, so an address that worked from a container,
  such as `host.docker.internal`, does not resolve for a site on a Mac host; Settings → Model Access needs
  to say which address to give.
- **The relay sets no deadline** of its own below OpenCode's 300 s wait for the next streamed chunk, so a
  stalled provider holds a request that long.
- **Stored and org-shared Claude subscriptions**: whether Anthropic's terms permit them is Anthropic's
  question to answer, asked in writing; the answer is recorded when it comes.
- **An allow decided after the plugin's own deadline** is recorded as allowed although the plugin refused
  the call, so the audit row can overstate what ran.
- **After a site restart**, processes in a container the site took over live until the container is
  recreated or removed as idle (§3).
- **The model an agent defaults to on OpenCode** when switched there with a model not on the list is
  Anthropic's Sonnet, which is paid; whether it should be a free model is undecided.
- **Repository settings the agent writes** may take effect when a harness itself runs `git` in the
  project, outside the sandbox. Not yet checked, for either runtime.
- **The gate's controls are designed from source, not demonstrated against.** "Keeping the gate whole"
  assumes its weaknesses real; until the lanes' tests show each control holding, the gate is not
  trusted with a real agent.
- **A rate-limited model.** Each harness retries a failed model request itself — OpenCode five times over
  about 70 s, reporting each as a `session.status` of type `retry`; Claude Code to its own limit, as
  `system/api_retry`. The site shows each retry in the chat and ends the turn, failed with the provider's
  reason, after three retries or when the provider asks to wait more than 60 s. Whether the site should
  switch to the agent's fallback model instead is not decided.
- **Readiness.** A starting server accepts connections it does not yet answer. Every request needs a
  time limit (§4); each readiness probe is abandoned after 250 ms and sent again.
- **The v1/v2 release-line split** upstream is unresolved.
- **No automatic resume of an interrupted turn.** OpenCode repairs history lazily on next read, losing
  the half-finished step. That is the posture Agenthix already takes; it is not a gap to close first.
- **Shell output truncation** is OpenCode's own; decide whether it is accepted as-is or normalised
  before it reaches `ToolCallLog` and the transcript.
- **Behaviour that is OpenCode's implementation, not its contract**: a plugin tool replacing a built-in
  (§7); `tool.execute.before` running before every tool call with its arguments, and a throw there
  ending only that call with the message reaching the model verbatim (gate item 3); and the `shell` key
  and `CLAUDE_CODE_SHELL_PREFIX` running every command through the launcher. All are re-checked at every
  upgrade.

## Decision records

| | Records |
|---|---|
| **Implements** | adr-0073 — OpenCode replaces `NativeRuntime`; `ClaudeSDKRuntime` stays |
| **Honours** | adr-0019, adr-0066, adr-0074, adr-0075, adr-0076, adr-0078, adr-0080 |
| **New** | adr-0081 — a harness runs the way its vendor intends, and stays warm while its conversations are live (§1, harness-lifetime-analysis.md) |
| **New** | adr-0082 — a conversation acts with its current turn's authority, and none between turns (§2) |
| **New** | adr-0083 — a process belongs to the conversation that started it (§3) |
| **New** | adr-0084 — an agent's skills are staged by Agenthix per turn, never taken from a harness's own discovery (§7) |
| **New** | adr-0085 — Agenthix owns a harness's file tools where the harness can be made its agent's confused deputy ("Tools Agenthix owns on OpenCode") |

## Deviations from plan.md

- **Restructured on 2026-09-27**, after the decision, from a candidate comparison into a design; the
  comparison moved to `candidate-comparison.md` in full.
- **Resumed on 2026-09-28** on person-scoped execution's container model. The integration shape, the permission model and
  the process lifecycle (§1–§3) were settled with the owner that day; the per-run server first proposed
  was rejected for its per-turn start-up cost.
- **Scope widened** to hq's credentials for other providers, to removing the per-turn reset for every
  runtime, and to one Claude process per conversation (§1). Subagents moved out.
- **Harness lifetime decided by analysis** (§1): a per-run OpenCode server was proposed first and
  rejected for its start-up; keeping Claude per turn was decided by benchmark and then reversed the same
  day, once each vendor's guidance was read.
- **Amended on 2026-09-29 from the verification phase:** keys travel with each model request through the
  plugin, not `PUT /auth` (§2, §6); web search on OpenCode is a platform tool the site serves, not
  OpenCode's own Exa search ("Tool-name mapping"); the gate weaknesses read in OpenCode's source are
  assumed real and closed by Agenthix's controls ("Keeping the gate whole"); the configuration denies `skill` and each
  session allows it again (§7); cancelling a Claude turn already worked, and the defect is the unhandled
  rejection of a late cancel (§1); containers start with `--init` and the OpenCode server untagged (§3);
  Agenthix titles OpenCode's sessions (§8).
- **The gate moved into Agenthix's plugin** (gate): OpenCode's permission system is its own UX aid by its
  security policy, so OpenCode allows everything and the plugin asks the site before every call, as
  Claude's `PreToolUse` hook does. The permission reply endpoint, the call-id map and the shell backstop
  are gone. **Containing the agent's terminal** — commands kept from the harness, for both runtimes — is
  added, settled by a phase-4 spike.
- **Landlock contains the agent's terminal** ("Keeping the gate whole", item 3), chosen by the owner on
  2026-09-29 from the phase-4 spike; the second user is the fallback. A refusal from the plugin's hook
  was verified to end one call only, and stopping a turn now rejects its pending decisions first.
- **Amended on 2026-09-30 from the build (phases 4 and 5) and the owner's decisions that day:** Agenthix
  owns OpenCode's file tools, wraps `rg`, and checks every upgrade against them ("Tools Agenthix owns on
  OpenCode", adr-0085); the configuration folders are read-only binds, not another user's; commands get
  their own home and a named list of readable harness folders; the plugin fetches each turn from the
  site; Claude's key arrives through `apiKeyHelper`; connection names, the event stream, turns sent
  without holding a request, OpenCode only in containers and the release order are as built (§1–§3, §6).
- **Amended on 2026-09-30 from the model-relay spike (plan 6.8), the owner's choice:** model requests go
  through the site's relay, on OpenCode and on Claude with an API key, so no model key enters the
  container; hq resolves a credential for every provider a turn may use; a person's own endpoint is
  reached from the site, not the container; a subscription is never relayed (§1, §6).
