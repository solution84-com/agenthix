---
created: 2026-09-27
description: Decide which externally maintained harness replaces Agenthix's own NativeRuntime — OpenCode, decided 2026-09-27 — and build it behind the runtime interface, with both harnesses run the way their vendors intend.
---

# Implementation Plan · Model vendor independence

## Goal

Replace `NativeRuntime` — the multi-provider runtime Agenthix built itself and never finished — with
OpenCode, an externally maintained harness, as the runtime for every model other than Claude on a
subscription: behind the same runtime interface (adr-0019), under the same authorization, audit and
credentials as a Claude run. Phases 1 and 2 decided which harness (adr-0073); the phases after them
build it.

`ClaudeSDKRuntime` is not a candidate in this decision and stays regardless of the outcome: no
externally-maintained harness can offer Claude subscription billing. OpenCode removed
subscription login in v1.3.0, its notes saying "Anthropic explicitly prohibits" it in third-party
harnesses — and subscription billing is the only realistic path to affordable single-user Claude access; the
alternative, metered API-key billing, is priced for organisations, not individuals. A conversation
keeps the runtime it started with (adr-0078), so Agenthix never needs to move a conversation's context
between two harnesses — the portability concern the single-harness proposal raises about supporting several harnesses does not
apply to two permanent runtimes coexisting.

**In scope:**
- researching the candidate harnesses and deciding which, if any, retires `NativeRuntime` — done
  (phases 1–2, adr-0073)
- the OpenCode runtime behind `AgentRuntime`, for chat, task runs and heartbeats (spec §1, §8)
- running both harnesses the way their vendors intend: OpenCode's server per container, one Claude
  process per conversation through streaming input (spec §1, adr-0081)
- live permissions and conversation-owned processes with the idle timer, removing the per-turn reset for
  both runtimes (spec §2–§3, adr-0082, adr-0083)
- the shared per-call gate, tool-name mapping, skills through Agenthix's plugin, and the harness's own
  to-do list allowed in both runtimes (spec "Per-call authorization gate", "Tool-name mapping", §7,
  adr-0084)
- hq's credentials extended to OpenRouter, OpenAI, Google, Anthropic by API key and an OpenAI-compatible
  endpoint, and the model list for them (spec §6)
- retiring `NativeRuntime`: a rename, not a migration
- writing up how it really works, in the living documentation, at the end

**Out of scope:**
- moving `ClaudeSDKRuntime`'s traffic anywhere else — see Goal
- usage attribution and governance across providers, and logins other than API keys for other
  providers — the single-harness proposal's remaining downstream questions, not needed to run OpenCode
- subagents — a capability not yet scoped; OpenCode's `task` tool is denied
- providers beyond the five — each costs a settings entry, a model list and a test; any can be added
  later without design changes
- hq or project policy narrowing the conversation idle time — the host-management milestone
- heartbeats in a boundary's container — its own issue; until then a heartbeat pulse starts its own OpenCode
  server (spec §8)

## Approach

This unit started as research, and research only produces something worth deciding on if the material
is gathered first and judged second. So phase 1 collected and phase 2 judged, and the build phases were
drawn only once the decision was made and the design settled (spec, 2026-09-28 and 2026-09-29).

**Claims are checked by running them.** Before the decision, the leading candidate was run in an agent
container (the person-scoped execution spike); harness lifetime was settled by benchmarking both harnesses
(`harness-lifetime-analysis.md`).

**The build verifies before it builds.** The spec marks a dozen points "to verify" that it could only
read in OpenCode's source — whether configuration an agent writes can override the gate, whether a
session's denied tools are hidden from the model, whether a plugin tool replaces a built-in, whether a
shell command can run without a permission request, what a `docker exec` per request costs, how a Claude
process behaves across many streamed turns. Several of them could overturn a part of the design, so they
run first, in a throwaway container with the benchmarks' local stand-ins for the model server and the
platform's tools, and their findings amend the spec before any code is written against it. That phase
also carries the acceptance check the research phase deferred (task 1.8): a named free OpenRouter model
that handles tool calls, with a second to fall back to, the platform's tools attached, a kill and a
resume.

**Then a contract, the seams every lane touches.** Reading the site's runtime shows where the work
meets: `runLaunch.ts` selects the runtime and builds the run's authority; `sdkToolGate.ts` holds the gate
both runtimes will share; `runTokens.ts` is where a conversation's token will be re-pointed per turn;
`AgentRuntime` gains the conversation-level calls a warm harness needs; the between-runs reset in
`containerRuns.ts` is what the process lifecycle replaces. These are written once, by one agent, so the
lanes branch from a base that already compiles against them:

- the runtime-neutral gate (`toolGate.ts`), with `sdkToolGate.ts` reduced to Claude's adapter;
- the per-conversation token that resolves to the current turn's capability and to nothing between turns;
- the runtime interface's additions — a conversation ending, its harness process going idle — and the
  process tag every runtime sets, with the one way a conversation's processes are found and killed;
- the container's run arguments: `--init`, so killed processes are reaped, and OpenCode's two
  configuration folders mounted where the agent cannot write them;
- runtime selection by name, `'native'` renamed `'opencode'`, `NativeRuntime.ts` and the manifest
  parser's unused Claude-name path deleted;
- `RunCredential` carrying its provider, the dispatch carrying the org's search key, and the protocol at
  14.0: a required field added is a breaking change (adr-0046), so the handshake refuses a peer on 13.x;
- every schema change, made here once per app so parallel lanes cannot collide in migration order — hq's
  `ModelCredential` gains a provider and a base URL, and its uniqueness changes to owner, provider and
  kind. Existing rows are Anthropic's; nothing is converted (pre-release).

**Then lanes in parallel, drawn by file**, each on its own branch and worktree, each worked by a
background agent on the model its work needs, with the lead as the bridge between them and the owner:

| Lane | Owns | Model |
|---|---|---|
| 1 — OpenCode runtime | New `OpenCodeRuntime.ts` and its server manager, relay, event translation, configuration rendering, sessions, handing each turn's key to the plugin, the per-conversation tool connection, and the server's settings that keep the gate whole | Opus — the harness boundary itself |
| 2 — OpenCode gate adapter | The site's end of the plugin's gate call over `toolGate.ts`, `openCodeNames.ts`; the site's `web_search` platform tool; the to-do list fix and the Claude gate's first unit test in `sdkToolGate.ts`/`sdkNames.ts` | Opus — the authorization boundary |
| 3 — OpenCode plugin and skills | The plugin (the gate hook `tool.execute.before`, `shell.env` tag and commands' environment, each model request's key through `chat.headers`, the `skill` tool), per-session skill staging beside `skillStaging.ts`, the skill list per turn | Opus — code inside the harness, on the security path |
| 4 — Claude per conversation | `ClaudeSDKRuntime.ts`, `DockerSpawner.ts`: streaming input, per-turn model and interrupt, every control call awaited, the model the SDK reports, replacement on a changed start or the memory ceiling | Opus — process lifetime and a known defect |
| 5 — Process lifecycle | `containerRuns.ts`, `containerScratch.ts`, a new conversation-process module and the idle timer; ending a conversation's processes on close, delete, leave and cancel | Opus — kills processes; a wrong match ends someone else's work |
| 6 — Provider credentials on hq | `modelCredential.ts`, `providerService.ts`, hq's settings actions and the Model Access page | Opus — credential custody |
| 7 — Models and agent settings | The model list generated into `core`, the picker, model overrides' cost rank, `'opencode'` in agent settings and packages | Sonnet — bounded, from a fixed catalogue |

Lanes 1, 2 and 3 meet at one seam — the OpenCode server's event stream and its plugin — which the
contract fixes as types, so they run together and are merged 1, 2, 3. Lanes 4 and 5 meet in
`AgentEngine.ts`: lane 5 owns it, and lane 4 calls the contract's conversation-level interface. Lanes 6
and 7 are on hq and `core` and touch none of the site's runtime. The shared `main.wasp` is reconciled by
the lead when lanes are rebased.

**Working rules for the lanes** are the spec's resource strategy ("How it is built"): every heavy
command through one machine-wide lock with Node's heap capped and one test worker; one container at a
time, capped and named for its lane; no model calls in lanes; every command and wait with a time limit;
typecheck and unit tests only, the touched ones while iterating and the full unit suite once before
reporting; the lead watching memory, load and swap, and reports for staleness. Integration, cross-app
and smoke tests run once, by the lead, over the lanes combined, because the apps use fixed ports and
share one test database.

**One branch for the whole unit, merged to `main` once, at the end.** Every phase lands on
`feature/opencode-runtime`, so the unit can be dropped whole if it meets a problem it cannot solve; it
merges `--no-ff` when phase 6's full regression passes and the owner says to. Lanes branch from it, are
rebased onto its head and merged into it `--no-ff` one at a time in the order above.

**The end-to-end proof is by hand, in the running app, on a real model:** chat, a task run and a
heartbeat on OpenCode; a blocked tool call and its steering text; a skill loaded; a cancelled turn;
a conversation left idle and resumed; the same agent on Claude and on OpenCode seeing the same tools and
skills. Turn latency and memory are measured against the benchmarks.

**At the end, what the build learned is written into the living documentation** — how the gate, the
OpenCode runtime, harness lifetime and skills really work — so the architecture describes the system as
built, not as designed.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0019 (runtime interface), adr-0046 (protocol versioning), adr-0060 (authority from the boundary), adr-0074–0080 (person-scoped execution's container model) — all Accepted |
| **Implements** | adr-0085 — Agenthix owns a harness's file tools where it can be its agent's confused deputy (cut 2026-09-30); adr-0073 — OpenCode replaces `NativeRuntime`, `ClaudeSDKRuntime` stays; adr-0081 — a harness runs the way its vendor intends, and stays warm while its conversations are live (from `harness-lifetime-analysis.md`); adr-0082 — a conversation acts with its current turn's authority; adr-0083 — a process belongs to the conversation that started it; adr-0084 — an agent's skills are staged by Agenthix per turn. adr-0081 to adr-0084 were cut from the spec on 2026-09-28 and 2026-09-29 |
| **Revisits** | adr-0019, lightly: the runtime interface gains conversation-level calls a warm harness needs; its design stands |

## Key decisions

| Decision | Why |
|---|---|
| Collect first, then evaluate, in separate phases | Judging while collecting is how the first source read becomes the answer |
| Harness facts go to the maintainers' research notes, not this unit | They describe systems we did not build and stay useful after this decision |
| More than one candidate is evaluated | A decision that weighed one option cannot say why the alternatives lost |
| The leading candidate is run, not only read about | Continuity, restart and isolation are the deciding criteria, and documentation is least reliable exactly there |
| `ClaudeSDKRuntime` is fixed, not a candidate | No externally-maintained harness can offer Claude subscription billing — OpenCode removed subscription login in v1.3.0, saying "Anthropic explicitly prohibits" it. Subscription billing is the only affordable path for a single user; metered API-key billing is priced for organisations |
| The decision is "what replaces `NativeRuntime`", not "what replaces the Claude Agent SDK" | The single-harness proposal asked for the latter; the owner declined it once subscription billing was on the table. `NativeRuntime` — Agenthix's own home-grown multi-provider engine — is the harness-shaped infrastructure the proposal's "we do not want to own a harness" argument actually targets |
| A conversation keeps the runtime it started with (adr-0078, which replaced "an agent's runtime never changes") | This is why the single-harness proposal's portability objection (context can't move between harnesses) doesn't block running two permanent, coexisting runtimes |
| Community trust and maturity became an eleventh criterion | Phase 1 found stars alone misleading — the most-starred candidate was also the youngest and carried the heaviest open-issue backlog relative to its size, and (per 1.7) one candidate's own star count was measuring a repo that had since been repurposed away from the actual harness code |
| Against: drawing the build phases before the decision | Their shape depends on the decision. Drawing them first would bias it toward the plan already written |
| The build's first phase verifies, and builds nothing | Several points the spec could only read in source — config precedence, hidden denied tools, a plugin replacing a built-in, a shell call that never asks — could each overturn part of the design; finding out after the lanes are built means rebuilding them |
| Weaknesses in the gate read in OpenCode's source are designed against without being demonstrated | Decided by the owner on 2026-09-29, when the runs that would have shown them stopped before any experiment ran. A control costs less than a demonstration, and the lanes test that each control holds |
| The gate is Agenthix's plugin, not OpenCode's permission system | OpenCode's security policy calls its permission system a UX aid, not a security boundary, and anyone with the server's password can answer its prompts. The plugin asks the site before every call, as Claude's `PreToolUse` hook does, so both runtimes have one gate of Agenthix's own |
| The agent's terminal is contained, on both runtimes | The harness enforcing the gate runs as the same user as the commands the agent runs, which can read its secrets and reach it. Whether a second user or a sandbox for commands is settled by a spike on evidence, since either changes file ownership and the image |
| Agenthix owns OpenCode's file tools, and nothing else of the harness | A harness's file tools act with its own permissions, so a link swapped in after the gate's check makes the harness read its secrets or write its home for the agent; OpenCode also reads `AGENTS.md` files the gate never sees. The file tools change least of anything in a harness; the loop and providers stay OpenCode's (adr-0085) |
| Against: a harness of Agenthix's own, for now | It would need the same file tools, sandbox and key handling, and add the loop and the providers back; revisited on the triggers adr-0085 names |
| Against: refusing symbolic links to commands | Closes every race at once but breaks package managers, language environments and repositories with links |
| Against: folding verification into the lanes | Each lane would discover a finding alone and route around it locally; findings that change the design have to change the spec first, once |
| A contract phase before the lanes | The gate, the per-conversation token, the runtime interface and the schemas are touched by several lanes; written once they cannot drift, and migrations made on parallel branches collide in order |
| Lanes drawn by file, not by feature | Two lanes editing one file is where parallel work loses time; where they must meet, the contract fixes the seam as types |
| Against: a lane for the plugin inside the OpenCode runtime lane | The plugin is code running inside the harness on the security path, with its own verification; it is reviewed on its own |
| Protocol to 14.0 | `RunCredential` gains a required provider; under adr-0046 a required field added is breaking, so a 13.x peer is refused rather than half-working |
| Against: settling the single-harness proposal's downstream questions here | The proposal defers them until the harness is chosen, since the harness constrains their answers |

## Work breakdown

Seven phases. The decision is the first seam: phases 1 and 2 researched and decided, and the build phases were drawn only once the decision and the design were settled. After it: verifying what the spec could only read, which may change the design; the contract every lane builds on; the lanes, independent once the contract exists; combining and proving them on a real model; and writing up how it really works.

### Phase 1 — Collect the research material
**Delivers:** a knowledge topic per candidate with a sourced finding for every criterion, and a written list of what Agenthix needs from a harness
**Starts when:** —
**Execution plan:** none. This is discovery, so its output can't be known in advance

- [x] 1.1 Write down what Agenthix needs from a harness, from the site's runtime as it stands
- [x] 1.2 Finalise the criteria: the single-harness proposal's ten, community trust (added once phase 1 found stars alone misleading), plus anything 1.1 adds
- [x] 1.3 Scan for other maintained multi-model harnesses, and choose which join the evaluation
- [x] 1.4 Catalogue OpenCode in the maintainers' research notes, with its source and a pinned version
- [x] 1.5 Findings for OpenCode against every criterion
- [x] 1.6 Findings for the Claude Agent SDK against every criterion, filling the gaps in its existing topic — kept as the fixed record of what `ClaudeSDKRuntime` already does, not as a competing candidate
- [x] 1.7 Findings for each other candidate chosen in 1.3 (Goose, OpenHands) against every criterion, cataloguing each in the research notes the same way
- [x] 1.8 Run OpenCode in an agent container: headless, a real model, our MCP server, a kill and a resume — moved to task 3.1, the verification phase's acceptance check. The person-scoped execution spike already ran OpenCode in the agent container, resumed a session in a new one and confirmed the existence check

### Phase 2 — Evaluate and decide
**Delivers:** the owner's decision on the single-harness proposal, recorded
**Starts when:** every criterion has a sourced finding for every candidate
**Execution plan:** none. It is one comparison and one decision

- [x] 2.1 Compare OpenCode, Goose, OpenHands and finishing `NativeRuntime` in-house criterion by criterion, with what each option would lose — now `candidate-comparison.md`, split out of the spec once the decision was made
- [x] 2.2 Present the options with a recommendation, and the owner decides — **decided 2026-09-27: OpenCode.** The owner weighted community trust/name recognition (task 1.3's eleventh criterion) over the lead's draft technical lean toward OpenHands; see `candidate-comparison.md`'s "Decision" section
- [x] 2.3 Record the decision: adr-0073 — retiring `NativeRuntime`, adopting OpenCode, `ClaudeSDKRuntime` kept fixed, the single-harness proposal superseded
- [x] 2.4 Draw the phases that follow from the decision — drawn 2026-09-29 as phases 3–7, from the spec as settled

### Phase 3 — Verify against the real harnesses
**Delivers:** a finding for every "to verify" point in the spec, the acceptance check run, and the spec
amended wherever a finding changes the design.
**Starts when:** the design is committed (done 2026-09-29).
**Execution plan:** none — this is discovery; its output cannot be known in advance.

- [x] 3.1 The acceptance check (task 1.8): OpenCode in the agent container, a named free OpenRouter model that handles tool calls with a second to fall back to, the platform's tools attached, a kill and a resume — **passed 2026-09-29** on `qwen/qwen3.8-27b:free`, with `openrouter/free` as the fallback. Found: `PUT /auth` does not reach a running server without a dispose that cancels its turns, so keys moved to the plugin's `chat.headers` hook; a restart drops the platform-tool connections and ends the event stream; OpenCode retries a rate-limited request for about 70 s
- [x] 3.2 Configuration an agent can write cannot override the gate — **not run**; the run stopped before any experiment. The owner decided to take what the source shows as real: OpenCode always reads two configuration folders in the home, and three more things there redirect it. Closed by the controls in the spec's "Keeping the gate whole", which the lanes test
- [x] 3.3 A session's rules hide denied tools and denied platform-tool connections from the model — **confirmed** for a deny whose pattern is `*`; a narrower deny only refuses on call
- [x] 3.4 Our plugin loads with `OPENCODE_DISABLE_DEFAULT_PLUGINS` set, replaces the built-in `skill` tool, sets the `shell.env` tag, and its `tool.execute.before` can refuse a call — **the first three confirmed**, and the tag overrides the server's own. `tool.execute.before` runs before the permission request (from source), so the shell check moved to `shell.env`. A configured plugin makes OpenCode install packages from npm into every writable configuration folder at start
- [x] 3.5 A shell command in which OpenCode's parser finds no command runs without a permission request — **not run**; assumed possible and designed against (spec gate item 6)
- [x] 3.6 OpenCode prints no skills section of its own when it has discovered none — **refuted**: it always lists a built-in skill. Denying `skill` in the configuration and allowing it again per session removes the section and keeps our tool
- [x] 3.7 The call-id → tool map: the event stream announces each tool call before its permission request — **confirmed**, as a `pending` part; a call's arguments come from the permission request, and a platform tool's request carries none
- [x] 3.8 Latency through one persistent `docker exec` relay, per request and on a turn of twenty tool calls — about 1 ms a request against 31 ms for a new `docker exec`; twenty approved calls took about half a second, the relay's share too small to measure
- [x] 3.9 Where the server's outbound connections go, and how to stop them (adr-0080) — by default the catalogue service, the npm registry, GitHub for ripgrep and the share service, and OpenCode's hosted provider is on; with the settings now in the spec, nothing but the model provider
- [x] 3.10 A Claude process fed by streamed messages keeps the gate hook, the platform-tool connection, `setModel()` and `interrupt()` across many turns, and survives a subscription credential refreshed while it runs — **confirmed** over fifty turns; a rewritten credential file is read on the next request, an API key only at start; the CLI renames retired model ids, so the run records the model the SDK reports
- [x] 3.11 Reproduce the cancel defect: whether cancelling a single-message Claude query stops it — **it does**; the defect is that a cancel arriving after the process exited rejects unhandled, which can end the site. Its issue rewritten around it
- [x] 3.12 A conversation's processes can be found by their tag, including ones started with `nohup` and `setsid`, and killed without touching another conversation's — **confirmed**, run as the image's user with a freeze-then-kill loop; `env -i` escapes the tag. The OpenCode server must start untagged, and PID 1 must reap (`--init`) or killed processes exhaust the process limit
- [x] 3.13 Amend the spec with every finding that changes the design, and file the rest where they belong — spec amended 2026-09-29; phases 4 and 5 gained the tasks the findings create

### Phase 4 — The contract
**Delivers:** the seams every lane builds on, merged with typecheck and unit tests passing, both apps'
migrations made, and the protocol at 14.0.
**Starts when:** phase 3's findings are in the spec. Task 4.11, a spike, runs first: its answer shapes 4.9, 4.10 and lane 1.
**Execution plan:** none — the spec fixes what each seam holds, and *Approach* lists them.

- [x] 4.1 The runtime-neutral gate, `toolGate.ts`, with `sdkToolGate.ts` reduced to Claude's adapter and behaving exactly as before, plus the rule refusing the harness's own file tools the harness home and `/proc` on real paths — done: `toolGate.ts`; the path rule resolves real paths in the container; `ToolCallLog.toolUseId` added and migrated
- [x] 4.2 The per-conversation platform token: resolved to the current turn's capability, and to nothing between turns — done
- [x] 4.3 The runtime interface's conversation-level calls — a conversation ending, its harness going idle — the process tag constant, and the finder: an exact match over every process's environment, freeze then kill until none is found, run as the image's user — done: `endConversation`, `conversationIdle`, `AGENTHIX_SESSION`, `endConversationProcesses`
- [x] 4.4 The OpenCode server's event and plugin seams as types, for lanes 1–3, including how the site hands the plugin each turn's key and token, and the plugin's call to the site for a gate decision — done: `core/src/harness/`; the plugin fetches each turn's key and token from the site (`POST /api/v1/harness/turn`), authenticated by a key per server
- [x] 4.5 Runtime selection by name; `'native'` renamed `'opencode'` in `hq/schema.prisma`'s comment, `agentPackageService.ts` and `runLaunch.ts`; `NativeRuntime.ts` deleted — done: `selectRuntime.ts`; `'opencode'` fails with "not available yet" until lane 1
- [x] 4.6 Delete the manifest parser's unused Claude-name path (`parseManifestFromOutput`, `KNOWN_SDK_TOOLS`) — done
- [x] 4.7 `RunCredential` carries its provider and base URL, and the dispatch carries the org's search key per turn; protocol to 14.0 — done: `CREDENTIAL_PROVIDERS`, `RunContextPayload.webSearchKey`; a 13.x peer is refused
- [x] 4.8 hq schema and migration: `ModelCredential` gains a provider and a base URL, unique on owner, provider and kind — done: `ModelCredentialProvider` enum, default `anthropic`; migration written with `prisma migrate diff`, since `migrate dev` refuses to run without a terminal when it warns about a new unique constraint
- [x] 4.9 The agent image: OpenCode pinned, its providers installed, its model catalogue read-only for `OPENCODE_MODELS_PATH`, `rg` on `PATH`, the plugin's place, and the Claude Code CLI pinned to the version the SDK bundles; the command launcher with Landlock, used as OpenCode's `shell` and Claude's `CLAUDE_CODE_SHELL_PREFIX` — done: `agenthix-contain`, the launcher, reports ABI 8 on Docker Desktop; Claude Code CLI 2.1.141, as the SDK (0.2.141) bundles; the image grew about 90 MB
- [x] 4.10 The container's run arguments (`containerRunArgs.ts`): `--init`, and OpenCode's two configuration folders mounted into the home, owned by another user and holding a `.gitignore`; no further `docker run` options, since Landlock works under Docker's default system-call filter — done: both folders are read-only binds of one site-owned folder holding a `.gitignore` (the site is not root, so it cannot give them to another user)
- [x] 4.11 Spike: contain the agent's terminal on both runtimes — a second user for the commands the agent runs against a sandbox for them — measuring file ownership in the workspace and git, the homes, the privilege the harness needs to start a command, and whether each works in our containers; the owner chooses, and the spec is amended — **Landlock chosen by the owner**: held every check with no change to the container's options, about 0.1 ms a command; a second user worked but broke file ownership and needs `no-new-privileges` off, and bubblewrap and Claude's own sandbox need Docker's system-call filter loosened
- [x] 4.12 Spike: a refusal thrown from the plugin's `tool.execute.before` ends that one call and reaches the model as an error, for a built-in, a plugin and a platform tool — **verified**: the call alone fails, the model gets the message verbatim, the turn continues; OpenCode sets no time limit on the hook; found that a decision allowed after an abort still runs, so stopping a turn rejects its pending decisions first

### Phase 5 — The lanes
**Delivers:** each lane done on its own branch, typecheck and unit tests passing in its worktree, and
its report written.
**Starts when:** phase 4 is on the unit's branch with typecheck and unit tests passing.
**Execution plan:** none — each lane builds one part of the spec, which says what and why; *Approach*
draws the boundaries between lanes, and each agent's brief carries them with the working rules.

#### Lane 1 — The OpenCode runtime (spec §1, §2, §4, §8, "Keeping the gate whole") · Opus

- [x] 5.1 The server manager: started untagged when a turn is dispatched to a container without one, password per server, loopback only, stopped when its last conversation goes idle and with the container, restarted after a crash with the platform-tool connections added again and the event stream resubscribed; never started on a home whose `opencode.db` holds an account
- [x] 5.2 The relay: one persistent `docker exec` carrying every request and the event stream, with a time limit on every request
- [x] 5.3 The server's environment and configuration: the outbound settings (`npm_config_offline`, `OPENCODE_DISABLE_MODELS_FETCH`, `OPENCODE_DISABLE_SHARE` and the rest), `OPENCODE_MODELS_PATH`, `OPENCODE_AUTH_CONTENT` empty; in `OPENCODE_CONFIG_CONTENT` every tool asks, `task`, `question` and `skill` denied, `todowrite` allowed, `enabled_providers`, sharing and updates off, OpenCode's own web search off — done; the configuration allows everything and keeps only the hiding denies, as the spec's gate section says
- [x] 5.4 Sessions: created with the working directory as the `directory` parameter, Agenthix's title, rules that begin with Agenthix's whole set (everything allowed, `task`, `question` and other conversations' connections denied and hidden, `skill` allowed), and a platform-tool connection of its own (`POST /mcp`) — done; a connection is named `agx` and 12 hex characters of a hash of the conversation id, and a session's rules deny `agx*` and allow its own
- [x] 5.5 A turn: system prompt, model and agent per message; the turn's key handed to the plugin; events translated to the runtime's events; abort
- [x] 5.6 The existence check, `GET /session/:id`, reading only a `404` as gone
- [x] 5.7 OpenCode's commands run through the Landlock launcher (the `shell` key), so none can read the server's password or reach it; the site's startup check that refuses agent commands without Landlock ABI 6 (spec "Keeping the gate whole", item 3) — done; Claude runs make the same check before starting `claude`
- [x] 5.8 Chat, task runs and heartbeats on OpenCode
- [x] 5.9 Tests: a turn end to end against the stand-in model; two conversations on one server; resume after a server restart; a missing session closes the conversation; and that each control holds — the agent can neither write nor replace the configuration folders, `auth.json` is not read, a rule from any configuration source does not outrank the session's, no command can read the server password; and from a command, the harness's environment, home, signals and tracing refused, while the tag reaches it, time limits kill it and its background processes survive — done, with the container tests under `npm run test:container`; the tag reaching a command is checked with the real plugin in phase 6

#### Lane 2 — The OpenCode gate adapter (spec "Per-call authorization gate", "Tool-name mapping") · Opus

- [x] 5.10 `openCodeNames.ts`: the tool table, including `apply_patch`, and the connection prefix removed by the known connection name
- [x] 5.11 The site's end of the gate call: session → run, the tool translated, the shared decision on the call's arguments, the audit row with the call id, allow or reject with steering text, failing closed on an error, a timeout or no turn running; a stopped turn's pending decisions rejected before OpenCode's session is aborted, and later ones for that run refused
- [x] 5.12 Bash judged on the whole command, the call's `command` argument
- [x] 5.13 The harness's own to-do list allowed in both runtimes: `TodoWrite` and `TodoRead` off the Claude gate's block list
- [x] 5.14 Web search on OpenCode: `web_search` served by the site's platform-tool server, calling Exa's Search API with the org's key from the turn's dispatch, behind an interface that lets the service be swapped — done; offered only on a connection that says it is OpenCode's, so Claude keeps its own WebSearch
- [x] 5.15 Tests: the Claude gate's first unit test; each OpenCode tool allowed and refused; a request with no turn running; an unknown tool; `web_search` with and without an Exa key, the key never reaching the container
- [x] 5.39 Both gates hand the harness the checked real path: Claude's `PreToolUse` through `updatedInput`, OpenCode's gate answer carrying the rewritten arguments for the plugin to apply (the seam type in `core/src/harness/` extended)
- [x] 5.42 A platform tool that stops the calling conversation's own processes, by the tag and never the harness, through the process finder; named in the agent's prompt; tests that it cannot reach another conversation's processes or the harness — done: `stop_processes`, matching the conversation's tag and the commands' own home, so never the harness

#### Lane 3 — The OpenCode plugin and skills (spec §3, §6, §7, gate item 6, "Keeping the gate whole") · Opus

- [x] 5.16 The plugin's gate hook, `tool.execute.before`, asking the site before every call and refusing a rejected one; and its `shell.env` hook: the `AGENTHIX_SESSION` tag, the server's secrets given empty values and `npm_config_offline` turned off for commands
- [x] 5.17 The plugin's `chat.headers` hook setting each model request's key for its session; verify that it wins over the provider's own header and what a provider needs to build without a real key
- [x] 5.18 The plugin's `skill` tool, reading only the calling session's staged folder, passing the gate, returning the built-in's output
- [x] 5.19 Per-session skill staging per turn, with the same namespaces and checks as Claude, bound read-only; the skill list in the turn's `system` field — done; the runtime stages them before each turn and appends their section to `system`
- [x] 5.20 Tests: two agents with same-named skills on one server each see their own; a skill edited between turns is seen on the next; a planted `.opencode/` skill is never seen; no tool call runs without the site's allow; two sessions' requests carry their own keys; no server secret in a command's environment
- [x] 5.41 Spike, then build if it holds: the plugin's own `read`, `write` and `edit` tools, which open the file first and check what was opened before using it, replacing OpenCode's; a racing link test — done for `read`, `write` and `edit`, which also check the `AGENTS.md` files OpenCode attaches; OpenCode's own `grep`, `glob` and `apply_patch` still open by path after the check

#### Lane 4 — Claude per conversation (spec §1) · Opus

- [x] 5.21 One `claude` process per conversation through streaming input, turns pushed into it
- [x] 5.22 Per turn: the token re-pointed, the gate's view of the run, `setModel()`, cancel through `interrupt()`, and the model the SDK reports recorded for the run
- [x] 5.23 Every control call on the query awaited and its rejection handled, including a cancel after the process has exited
- [x] 5.24 Replaced when the tool list, system prompt, skills or API key differ from its start, or above `AGENT_HARNESS_MEMORY_MB`; the API key given on the process's own `docker exec`, not at container creation — done; a changed system prompt includes the agenda and memory files, so editing either replaces the process at the next turn
- [x] 5.25 Claude's commands run through the Landlock launcher (`CLAUDE_CODE_SHELL_PREFIX` on the process's `docker exec`), `ANTHROPIC_API_KEY` removed from them
- [x] 5.26 Tests: two turns in one process; a changed tool list replaces it; a cancelled turn stops; a late cancel leaves the site running; the process carries the conversation's tag; a command cannot read, signal or trace the `claude` process or read its home
- [x] 5.40 Claude Code's API key through its `apiKeyHelper` setting rather than the process's environment, if it holds in SDK mode; otherwise recorded as a risk — done: the process's key comes from a one-use ticket the site trades through Claude Code's `apiKeyHelper`, never from its environment

#### Lane 5 — Process lifecycle (spec §3) · Opus

- [x] 5.27 Remove the between-runs reset
- [x] 5.28 The conversation idle timer, `AGENT_SESSION_IDLE_MINUTES`, ending the conversation's processes and harness
- [x] 5.29 A conversation's processes ended on close, delete and its person leaving; a cancelled turn stops only its own
- [x] 5.30 The staging folders and credentials a conversation leaves are removed with it
- [x] 5.31 Tests: two conversations in one container, one idles out and the other's processes survive; the OpenCode server survives a conversation's end; a preview held open survives

#### Lane 6 — Provider credentials on hq (spec §6) · Opus

- [x] 5.32 Resolution per provider: the boundary's own, then the org's; subscriptions Anthropic's only, as today
- [x] 5.33 The org's keys as `Provider` rows per provider, and the org's Exa key stored the same way and sent to the site with each turn
- [x] 5.34 Settings → Model Access: a key per provider at the org, the project and the person; an OpenAI-compatible endpoint's base URL; the org's Exa key
- [x] 5.35 Tests: each boundary's fallback per provider; a subscription never offered to OpenCode

#### Lane 7 — Models and agent settings (spec §6) · Sonnet

- [x] 5.36 The model list generated into `core` from the pinned OpenCode catalogue, filtered to the five providers, with cost ranks from its prices
- [x] 5.37 The agent's runtime choice offers OpenCode; the model picker and model overrides use the list for either runtime
- [x] 5.38 Tests: overrides equal or cheaper on OpenCode; a typed model for an OpenAI-compatible endpoint

### Phase 6 — Combine and prove
**Delivers:** every lane merged, the full regression passing, and the spec's promises walked by hand in
the running app on a real model.
**Starts when:** the phase 5 lanes are done; each is merged as it finishes, in the order *Approach*
gives.
**Execution plan:** none — the regression is a fixed list of commands, and what a failure needs is not
known in advance.

- [x] 6.1 The full regression: core, hq and site unit and integration tests, typecheck, the bundle checks and cross-app — passed 2026-09-29 apart from the container checks: core 174, hq 3571 and site 1826 unit tests, hq integration 299, site integration 32, cross-app 20, the bundle check, every typecheck
- [x] 6.2 Fix what the regression finds — the container checks were stale after the merge (skill staging, the real plugin in the image) and two files never ran; now 25 of 25 pass, including the tag reaching a command through the real plugin and the gate refusing a read of the harness home. No defect in the code
- [x] 6.3 Walk it on a real model: chat, a task run and a heartbeat on OpenCode; a blocked tool call and its steering text; a skill loaded; a web search on each runtime; a cancelled turn on each runtime; a conversation idled out and resumed; one agent on Claude and on OpenCode with the same tools and skills — done 2026-09-30 with the owner, on OpenRouter (a free router, then DeepSeek V4 Flash) and Claude Sonnet 4.6 on a subscription: every step passes on both runtimes; no provider key found in the container during a turn. It found Claude never loading staged skills (6.18) and the polish in 6.19–6.21; three items outside the unit went to issues
- [x] 6.4 Measure turn latency and memory against `harness-lifetime-analysis.md` — done 2026-09-30 through the real runtimes and the relay, on a stand-in model: Claude new process 294 ms, following turn 37 ms before 6.16 took its memory check off the turn; OpenCode server start 0.69 s (was 1.7 s, the site now turns off features it does not use), first turn of a conversation 1.3 s after 6.15, following turn 37 ms; memory Claude about 232 MB a process, OpenCode 317 MB idle and 545 MB after 8 turns, plus 61 MB for the relay process; the relay adds 1.5 ms a model request on Claude, 16 ms on OpenCode
- [x] 6.5 `grep` and `glob` run `rg` through the launcher: a small `rg` in the image ahead of the real one; check whether `USE_BUILTIN_RIPGREP=0` makes Claude's `Grep` and `Glob` use it, and set it if so — done: `/usr/local/bin/rg` runs the real one through the launcher, which can now start from inside its own sandbox; `USE_BUILTIN_RIPGREP=0` verified and set for Claude. The server's `rg` cannot search staged skills folders
- [x] 6.6 The plugin's own `apply_patch`, opening each file first and checking what was opened, as `edit` and `write` do — done: OpenCode's parser copied; every file opened first, deletes and moves inside the checked folder; the gate keeps a deleted link's own name. Moving a link moves its target, where OpenCode removes the link
- [x] 6.7 The upgrade comparison check: Agenthix's `read`, `write`, `edit`, `apply_patch` and `skill` beside OpenCode's own on the same fixtures in the agent image, every difference reported — done: 49 cases, eight declared differences each with its reason; it found and fixed three places our tools' error text differed from OpenCode's. Container suites 78 of 78
- [x] 6.8 Spike: OpenCode's model requests relayed by the site, which adds the key, so no key enters the container; and whether Anthropic's terms allow the same for a subscription — done: every provider worked through a prototype relay, about 0.5 ms a request; Claude with an API key too, through `ANTHROPIC_BASE_URL`. whether Anthropic's terms allow relaying or storing a subscription is Anthropic's to answer (the terms say a product may not "collect, store, or intermediate" its credentials)
- [x] 6.9 The model relay: a site route that streams each model request to its provider with the key added, per-turn relay tokens from the turn endpoint and `apiKeyHelper`, every provider's address pointed at it, and hq resolving a credential for each provider a turn may use — done: no key was found in the container during a turn on either runtime; a changed API key no longer replaces a Claude process. Fallback models' keys are resolved, though no agent names a fallback model yet. Full regression passed 2026-09-30
- [x] 6.10 The model relay honours `HTTPS_PROXY` and `NO_PROXY`, so a site behind a proxy reaches the providers — done: a `CONNECT` tunnel for `https:` providers; an `http:` provider is never proxied, since the proxy would see the key
- [x] 6.11 OpenCode's platform-tool connection identifies itself, so the site offers it `web_search` — done: the connection sends `x-agenthix-harness: opencode`; Claude keeps its own `WebSearch`
- [x] 6.12 A `never` tool or bash pattern is refused whether or not the run has an approved manifest, and OpenCode's session rules hide `never` built-ins as Claude's tool list does — done: `never` tools, bash in state `never` and `never` patterns refused in every run, even where a manifest approves `*`; OpenCode session rules deny `never` built-ins, refreshed each turn (edit/write/apply_patch hidden only when both edit and write are `never`)
- [x] 6.13 The existence check no longer leaves an OpenCode server running that no conversation holds — done: a server started for the check is stopped when the check finds nothing or the run fails before its turn starts; kept when the session is found, so a resume starts it once
- [x] 6.14 A conversation's model choices follow the runtime it started on, not the agent's current one — done: hq already held the runtime on `AgentSession`; a conversation with none recorded falls back to the agent's
- [x] 6.15 OpenCode's readiness wait retries a probe that hangs instead of waiting out a 1.5 s timeout — done: a 250 ms per-probe timeout, retried at once; first OpenCode turn 2.8 s → 1.3 s, no slow starts in 7
- [x] 6.16 The Claude process's memory check runs after a turn rather than in front of the next one — done: measured in the background once a turn reaches its result; the next turn reads the stored figure
- [x] 6.17 A run with no approved manifest (a heartbeat) refuses and hides `ask` tools and `ask` bash commands, as it does `never` ones — a stopgap until heartbeats become boundary-owned routines — done: the signal is a run with no approved manifest; refused calls are logged as `tool-ask-unattended` and `bash-ask-unattended`; a command matching an `always` pattern still runs, as in chat; the tools the heartbeat prompt uses are `always`
- [x] 6.18 A Claude agent can load its staged skills: `Skill` is in the process's tool list and passes the gate (found in the 6.3 walk-through: the model searched the files instead) — done: the staged folder is given to Claude as a local plugin with the `skills` allowlist; staging rebuilds each SKILL.md header from an allowlist of keys, so no hooks, and inline shell is off; a skill load is logged as `skill` on both runtimes and never refused for permission; a CLI answer with no model call is shown
- [x] 6.19 Choosing a runtime and a model: the New Agent dialog offers the runtime; runtimes shown by name; the Claude model list current and generated like OpenCode's; the model picker grouped by provider, with relative cost and search — done: the Claude list and every price come from the pinned catalogue (default Sonnet 5, one place per runtime); OpenCode grouped by provider, free first, marked free/$/$$/$$$ by price, with a filter
- [x] 6.20 How a turn ends is told truthfully: a provider rate-limiting or failing is shown (and a retry bounded) rather than an endless wait; a stopped turn says it was stopped and is recorded as stopped; a turn that failed without a model call carries the harness's reason — done: retries shown on both runtimes and bounded at three or a wait over 60 s, then the turn fails with the provider's reason; a stop is `CANCELLED` and says "Stopped." when nothing was written; the credential hint only when the provider refused the key
- [x] 6.21 OpenCode's reply text keeps the breaks between its parts; the shared gate logs under its own name — done: a text part or block after an earlier one starts with a paragraph break, on OpenCode and Claude alike

### Phase 7 — How it really works, and close
**Delivers:** the living documentation describing the system as built, the milestone's objective
verified, and the unit closed.
**Starts when:** phase 6 is done.
**Execution plan:** none — the documents follow from what phases 3–6 found, and closing the unit is its
own skill's checklist.

- [x] 7.1 The tools architecture: OpenCode's tools beside `claude-tools.md`, which of them are Agenthix's own and why, and the shared gate in `tool-control.md` — done: `opencode-tools.md` new; `tool-control.md` rewritten around the shared gate
- [x] 7.2 The runtime's architecture: how each harness is driven, kept warm and ended — done: `agent-runtimes.md` and `model-relay.md` new in `docs/architecture/sites/`
- [x] 7.3 How skills reach each runtime, in `docs/concepts/skills/` — done
- [x] 7.4 The OpenCode knowledge-base notes updated with what the build found — done
- [x] 7.5 Verify the milestone's build objective and tick it on the roadmap, with how and when — done 2026-09-30: the objective and the milestone marked Done on the roadmap, verified by the 6.3 walk-through and the full regression
- [x] 7.6 Close the single-harness proposal and the cancel defect's issue, with notes on the records the unit implemented — done 2026-10-01; the unit merged to `main` as `c12bff4`

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | None: the research material was collected as planned | — |
| 2 | Paused on 2026-09-27, while task 2.4 was being scoped, and resumes after the person-scoped execution milestone. Scope answers already given then: the container test is the first build phase's acceptance check; the authorization gate exists before any real agent runs on OpenCode; no subagents; hq's credentials extend to other providers; task runs, chat and heartbeats all work on OpenCode | Person-scoped execution changes the container model, and with it where OpenCode's state lives and how a session is kept to one writer. Building on today's model would mean building part of it twice |
| 2 | Resumed on 2026-09-28 on person-scoped execution's container model. The integration shape, the permission model and the process lifecycle were settled with the owner (spec §1–§3, adr-0081–0083): permissions read every turn, processes owned by their conversation, and the per-turn reset removed for every runtime. Harness lifetime was settled by `harness-lifetime-analysis.md` (benchmarks of both harnesses and each vendor's guidance): each harness runs the way its vendor intends — OpenCode's server per container, one Claude process per conversation through streaming input (spec §1, adr-0081). Provider credentials came into scope; subagents moved out | A server per turn, first proposed, cost about 2.4 s on every turn; keeping Claude per turn was decided by benchmark, then reversed once each vendor's guidance was read. Removing the reset follows from person-scoped execution: a container now belongs to one runner, so the reset protected no one from anyone |
| 2 | Build phases drawn on 2026-09-29 (task 2.4) from the spec as settled that day: verify, contract, seven lanes, combine and prove, write up and close | — |
| 3 | The configuration and shell-command checks (3.2, 3.5, and the environment part of 3.4) stopped before any experiment ran; the owner decided to take the weaknesses the source shows as real and design against them. The spec was amended from the other findings: keys through the plugin's `chat.headers` hook instead of `PUT /auth`; web search on OpenCode as a platform tool the site serves with the org's Exa key; the shell check moved to `shell.env`; `--init` and an untagged server; Agenthix's own session titles. Phases 4 and 5 gained tasks 4.10, 5.7, 5.14, 5.17 and 5.23, and phase 5 was renumbered | Demonstrating each weakness costs more than closing it, and the lanes test the controls. `PUT /auth` takes effect only after a dispose that cancels running turns; an Exa key in OpenCode's environment would be readable by the agent |
| 3 | After the findings, on 2026-09-29: the gate moved into Agenthix's plugin — OpenCode allows everything and the plugin asks the site before every call, as Claude's `PreToolUse` hook does — and containing the agent's terminal was added for both runtimes. Tasks 4.11 and 4.12 (spikes) and 5.25 were added, and later lane tasks renumbered; 4.4, 5.4, 5.7, 5.11, 5.12, 5.16, 5.18 and 5.20 changed | OpenCode's security policy says its permission system is a UX aid, not a security boundary, and any command can read the server's password and answer its prompts. The same weakness, harder to reach, is assumed for the `claude` CLI |
| 4 | Spikes 4.11 and 4.12 ran first. The owner chose Landlock to contain the agent's terminal; tasks 4.1, 4.9, 4.10, 5.7, 5.9, 5.11, 5.25 and 5.26 name it and its checks. A refusal from the plugin's hook ends one call only, and stopping a turn now rejects its pending decisions first | Landlock needed no change to the container's options, privilege or file ownership; the alternatives needed one or more. A decision allowed after an abort would otherwise run unrecorded |
| 4 | The unit stays on one branch, `feature/opencode-runtime`, merged to `main` once at the end, instead of a branch merged per phase | The owner's call on 2026-09-29: keeping the unit apart from `main` until it is proven lets it be dropped whole if it meets a problem it cannot solve |
| 4 | Phase 4 found that the file-tool path check runs before the harness opens the file, so a command can swap a checked path for a link. The owner chose on 2026-09-29 to narrow it now and close it before phase 6: tasks 5.39–5.41 added, numbered after the last lane task so the others keep their numbers | Only a hostile prompt winning a race can use it, but it would expose the org's model keys |
| 4 | Landlock refuses signals between one command's sandbox and another's, so an agent cannot stop a process an earlier command started. The owner chose on 2026-09-29 to keep that and add a platform tool that stops the conversation's own processes (5.42, lane 2) | Dropping signal scoping would let commands kill or pause the harness |
| 5 | The seven lanes ran in parallel and were merged 1 to 7 on 2026-09-29, the lead reconciling at each merge in commits of its own: one name for a conversation's platform-tool connection (lanes 1 and 2 each wrote one); skill staging called from the OpenCode runtime; the Landlock check before a `claude` process starts; a released conversation's runtime told before the finder runs, so Claude closes gracefully; the relay answering its waiting requests at once when closed (a flaky test found it). Left open for the owner: OpenCode's own `grep`, `glob` and `apply_patch` still open by path after the gate's check | Parallel lanes on their own branches kept each lane's history clean; the seams the contract fixed as types held, and where two lanes met outside them the lead chose one |
| 6 | The regression passed; the container checks were stale after the merge and were fixed without a code change. On 2026-09-30 the owner decided how far Agenthix owns OpenCode's tools: its own `read`, `write`, `edit` and `apply_patch`, `rg` run through the launcher, a comparison check at every upgrade, and a spike on relaying model requests through the site (tasks 6.5–6.8, before the walk in 6.3); the triggers for reconsidering a harness of Agenthix's own were set (adr-0085). The spec was amended with the decisions the build made (spec deviations, 2026-09-30) | Replacing `grep` and `glob` would have meant owning a search; running `rg` in the sandbox closes the same gap with one file in the image. `apply_patch` is GPT models' only way to edit, so turning it off was not an option |
| 6 | Tasks 6.11–6.16 added on 2026-09-30. Writing the living documentation against the code found two gate defects — OpenCode was never offered `web_search`, and a run with no approved manifest (every heartbeat) was not refused `never` tools, which on OpenCode nothing else hid — and a server left running by the existence check; the model picker followed the agent's runtime rather than the conversation's. The 6.4 measurement found a readiness probe that hung for 1.5 s on about two OpenCode starts in five, and a 33 ms memory check in front of every following Claude turn | Each was critical to the objective (web search and tool control on both runtimes) or to speed and memory, the owner's first two priorities, so each was fixed in the unit rather than queued |
| 6 | Tasks 6.17–6.21 added on 2026-09-30. 6.17: the owner decided that a heartbeat, which has nobody to approve, refuses `ask` tools until heartbeats become boundary-owned routines. 6.18–6.21 came from the hand walk-through: Claude had never loaded staged skills (the CLI reads skills from an added folder only with project settings on, which the site keeps off), so they are given as a local plugin, with skill hooks and inline shell removed; and choosing a runtime and model, how a turn ends, and reply text were each fixed. Three findings outside the unit went to issues, and one more to a fourth | The walk-through is where the spec's promise of the same agent on either runtime was first tried with a person at the keyboard; each item was either part of that promise or of the owner's speed-and-honesty bar, so each was fixed in the unit |
| 7 | Phase 7's documents were written against the code rather than the spec, which is what found the 6.11–6.13 defects; they were amended after each later fix | A description checked only against the design would have recorded the design's intent, not the system |

## Open items at close

Triaged on 2026-10-01; each was closed or raised as its own issue.

- **Closed by the unit's own checks:** stopping a turn rejects its pending decisions (container tests); the gate's controls are demonstrated in the agent image, not only designed (container tests, 89 passing); readiness (6.15); the tools Agenthix owns drifting from OpenCode's, and behaviour that is OpenCode's implementation rather than its contract, are caught by the upgrade comparison and checklist (adr-0085).
- **Closed as accepted risks, recorded where the decision is:** Claude's `Read`, `Edit` and `Write` narrowed but not closed (adr-0085); the relay token within the confused deputy's reach for one turn (spec §6); no automatic resume of an interrupted turn; the upstream release-line split (adr-0085's revisit triggers).
- **Raised as issues, release-blocking:** whether a harness runs `git` against agent-written settings outside the sandbox, and the container and relay checks on Linux, both under the first release; whether stored subscriptions are permitted was already blocking.
- **Raised as issues:** four from the walk-through, and thirteen from the spec's open risks and the build's notes.
- **Not run here:** the QA audit of the finished product, which is its own unit before release.
