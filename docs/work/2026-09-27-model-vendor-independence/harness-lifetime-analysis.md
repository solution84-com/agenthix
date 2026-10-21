---
created: 2026-09-28
description: How long a harness process should live — per turn, or kept warm while its conversations are live — weighed on measured start-up time and memory for Claude Code and OpenCode in the agent container, and on each vendor's own guidance. Decided 2026-09-28 — each harness runs the way its vendor intends (adr-0081).
---

# Harness lifetime: start-up time against memory

A harness process can be started for each turn and ended with it, or kept warm between turns and ended
when its conversations go idle. Starting per turn costs time on every turn; keeping warm costs memory
for as long as the process lives. This document measures both costs for the two runtimes Agenthix runs —
Claude Code (`ClaudeSDKRuntime`) and OpenCode — and weighs one rule for both.

Speed is the most important quality of a conversational agent: every turn already crosses the browser,
hq, the site and the model. Memory matters too: a site runs on one machine, often a person's own.

## Method

Two benchmarks, run on 2026-09-28 on the agent image with Claude Code 2.1.281 and OpenCode
(`opencode-ai`) 1.18.32, one throwaway container at a time capped at 2 GB and 2 CPUs.

- **No real model.** A local stand-in for the Anthropic Messages API answered every model request with a
  short streamed reply and logged when each request arrived.
- **A platform-tool connection** to a local stand-in MCP server (HTTP, three tools, a bearer token), so
  start-up includes connecting to the platform's tools, as real runs do.
- **Issued the way the site issues it**: from the host, through `docker exec`.
- **Seven turns per measurement** unless stated; medians, with the range in brackets.
- **"To the model request"** ends at the stand-in's own timestamp, on the container's clock, so it
  carries up to about 90 ms of clock difference; **"to the end of the turn"** is measured on the host's
  clock alone and is the firmer figure.

What the benchmarks did not include: a long conversation (resuming reads the whole session file, so a
long one starts slower), skills, a large system prompt, or a real model's own latency, which is the same
in every option and dwarfs everything here.

## Results

### Turn latency

| | To the model request | To the end of the turn |
|---|---|---|
| **Claude, new process** resuming the conversation | 198 ms (195–203) | 247 ms (240–253) |
| **Claude, turn pushed into a running process** | 5 ms (3–6) | 8 ms (7–10) |
| **OpenCode, new server**, then resume and prompt | 1,696 ms to the server answering (1,657–1,748), then 689 ms to the model request (668–710): about **2.4 s** | about 2.4 s |
| **OpenCode, running server**, a new `docker exec` per request | 41 ms (38–58) | 56 ms (51–76) |
| **OpenCode, running server**, one persistent `docker exec` relay | 15 ms (13–55) | 24 ms (22–65) |

A new Claude process costs about **a quarter of a second** per turn. A new OpenCode server costs about
**2.4 seconds**: 1.7 s for the process to answer, and 0.7 s more for the first prompt on it, which is
when OpenCode sets up the working directory and connects to the platform's tools.

### What OpenCode's start-up is made of

Five starts each, time until the server answers:

| Condition | Time |
|---|---|
| Normal network, a home with OpenCode's database already in it | 1,719 ms (1,673–1,768) |
| **No network at all** (`--network none`) | 1,698 ms (1,679–1,771) |
| A fresh, empty home | 1,683 ms (1,682–1,739) |

Neither network access nor first-time setup moves it. The outbound connections the server opens at
start-up do not hold it up, and **OpenCode starts and completes a turn with no network at all**. The time
is the program itself starting; nothing Agenthix configures shortens it.

### Memory

| | Resident memory |
|---|---|
| **Claude**, one running process after 8 turns | 250 MB |
| **OpenCode** server, idle after start | 323 MB |
| OpenCode server, after one session of 8 turns | 681 MB |
| OpenCode server, after 6 sessions and 28 turns | 595 MB |

OpenCode's server grows by a few hundred megabytes once it has served turns, then holds roughly steady
as sessions are added: a session costs little inside it. A Claude process is one conversation's.

## How memory scales

What stays warm, and what the memory grows with:

| | What stays warm | Grows with |
|---|---|---|
| Claude, per turn | nothing between turns | turns running at once, capped by `AGENT_MAX_CONCURRENT_RUNS` (5 by default) |
| Claude, kept warm | one process per live conversation | live conversations |
| OpenCode, kept warm | one server per container | active containers — one per person per boundary, plus one per project for its own runs |

Two examples, taking a conversation as live for 30 minutes after its last turn (the idle timer):

| | One person, one project, 5 live conversations | A site: 10 people, 2 projects each, 3 live conversations per project |
|---|---|---|
| Claude, per turn | 250 MB while a turn runs, nothing otherwise | at most 5 × 250 MB = **1.25 GB**, only while turns run |
| Claude, kept warm | 5 × 250 MB = **1.25 GB** | 60 × 250 MB = **15 GB** |
| OpenCode, kept warm | one server: **0.3–0.7 GB** | 20 servers × 0.3–0.7 GB = **6–14 GB** |

Memory is not only Claude's cost. OpenCode's is flat per container but each container's server is
large, and a site with many active people holds many of them. What bounds both is ending a warm harness
when its conversations go idle.

## Options: one rule for both runtimes

**A. Warm while live, for both.** A harness stays warm while any conversation it serves is live, and the
idle timer ends it: OpenCode's server per container, Claude's process per conversation.
- Turns: Claude about 8 ms, OpenCode about 24 ms. First turn after going idle: Claude 0.25 s, OpenCode
  2.4 s.
- Memory: Claude's grows with live conversations — 15 GB in the site example, for a saving of a quarter
  of a second per turn.

**B. Per turn, for both.** Nothing stays warm.
- Rejected on OpenCode alone: 2.4 s on every turn.

**C. One rule by cost: keep a harness warm when starting it would cost a turn a second or more.** Rejected (see Decision).
OpenCode's server is kept warm while any conversation in its container is live; Claude starts per turn.
- Turns: Claude about 0.25 s, OpenCode about 24 ms. First OpenCode turn after going idle: 2.4 s.
- Memory: Claude costs memory only while turns run; OpenCode costs one server per container with a live
  conversation.
- It is one rule — the same threshold the owner set for Claude — applied to each runtime's measured
  start-up. A runtime whose start-up changes is re-judged by it.

## What each vendor intends

Checked on 2026-09-28 against each vendor's own documentation.

**Claude Agent SDK** — the "Streaming Input" and "Hosting the Agent SDK" pages of the Agent SDK docs
(code.claude.com/docs/en/agent-sdk/), and the SDK's type comments (`sdk.d.ts`, 0.2.141):

- Streaming input — one `query()` fed a stream of user messages — is "the **preferred** way to use the
  Claude Agent SDK", and "allows the agent to operate as a long lived process that takes in user input,
  handles interruptions, surfaces permission requests, and handles session management."
- Single message input — what Agenthix used — is for when "you need a one-shot response" or "a
  stateless environment, such as a lambda function". It does not support "real-time interruption",
  "dynamic message queueing" or "natural multi-turn conversations".
- The control methods — `interrupt()`, `setModel()`, `setPermissionMode()` — "are only supported when
  streaming input/output is used".
- For hosting, a chat bot is the example of *long-running sessions*, each active session mapped to "a
  long-lived query and the subprocess behind it". Sessions idle between interactions follow the *hybrid*
  pattern: spun down after an idle timeout and resumed when the user returns.
- "1 GiB RAM, 5 GiB disk, and 1 CPU per agent is a reasonable starting point"; "memory usage grows with
  session length", and the remedy is to "cap session length or recycle subprocesses periodically".

**OpenCode** — its server, CLI and SDK documentation (opencode.ai/docs/server, /cli, /sdk), 1.18.32:

- "When you run `opencode` it starts a TUI and a server. Where the TUI is the client that talks to the
  server… This architecture lets opencode support multiple clients." One server holds many sessions.
- `opencode run` is for "scripting, automation, or when you want a quick answer", and its `--attach`
  option exists "to avoid MCP server cold boot times on every run".
- Nothing is documented about a server's lifetime, idle shutdown or memory.

**Both vendors intend their harness to stay running across a conversation's turns.** Running Claude per
turn used it in the mode its documentation reserves for one-shot, stateless work, and gave up what a
chat needs: interrupting a turn, and queueing a message sent while one runs. The quarter-second the
benchmark measured was never the whole difference.

## Decision

**Decided 2026-09-28: each harness runs the way its vendor intends** — one rule for every runtime,
recorded in adr-0081. That is option A: a harness stays warm while the conversations it serves are live,
and the conversation idle timer ends it.

- **Claude:** one process per live conversation, fed each turn through streaming input, replaced when it
  passes a memory ceiling or when what was fixed at its start changes.
- **OpenCode:** one server per container, shared by the conversations in it, stopped when the last of
  them goes idle.

The memory this costs is what both vendors' guidance plans for, bounded by the idle timer and by
recycling. Option C is rejected: it saves memory by running Claude outside its intended mode.

Two findings from the benchmarks apply as well:

- **The site drives OpenCode through one persistent relay**, not a new `docker exec` per request:
  15 ms against 41 ms to the model request. Every permission reply is a request, so a turn with twenty
  tool calls saves about half a second.
  *(2026-09-29: the verification phase measured single requests directly — about 1 ms through the relay
  against about 31 ms for a new `docker exec`, and half a second for twenty approved tool calls in all —
  and the gate later moved into Agenthix's plugin, so an approval is the plugin's call to the site rather
  than a permission reply. See the design spec, §1 and the gate section.)*
- **The first OpenCode turn after its server stopped pays 2.4 s.** Starting the server as soon as a turn
  is dispatched to the container, alongside anything else the launch does, hides part of it.

## What would reopen this

- **A vendor changing what it recommends** — a harness is re-checked against its vendor's guidance when
  it is upgraded.
- **Memory on real turns** far from these figures, in either direction.
