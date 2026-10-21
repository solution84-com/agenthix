---
created: 2026-09-28
description: A person's conversations are their own — containers keyed on boundary × runner, private harness homes, parallel runs in a shared project, and what happens when a harness's state is gone.
---

# Design Spec · Person-scoped execution

**Approved** section by section on 2026-09-28, and built in the same unit — what merged, and where it departed from this design, is in [`plan.md`](plan.md). Addresses
person-scoped execution as widened by the owner's comment of
2026-09-27, and absorbs the runner claim.

## Why this exists

A project's container has one harness home, shared by everyone who works in the project. An agent
running for one member can read what the harness stored for another: their past conversations, and
their memory as injected into their prompts. hq never shows one member another's chats (adr-0041),
but an agent with shell and file tools goes around hq. Agents run as one non-root user (`appuser`,
uid 1001, `site/docker/agent.Dockerfile`), so nothing inside the container separates one member's
files from another's.

**How serious it is.** It is an insider privacy leak, not a breach from outside: only people and
agents inside the same project can reach it, and a single-person install is unaffected. It still
matters before release, for two reasons:

- **It breaks a promise the product makes.** People are told their chats are private and will put
  private things in them. A guarantee hq enforces but a teammate can bypass by asking their agent is
  worse than none, because people trust it.
- **It needs no bad actor.** Untrusted content in a project — a README, an issue body, a fetched page —
  can instruct an agent to copy other people's transcripts into a shared file.

**Why before release.** Once people's data depends on the container model, changing it means
migrating that data. Until the first release there is nothing to migrate.

**Why it is designed before OpenCode, not with it.** The platform abstraction comes first: a harness
Agenthix does not own must not shape its security boundary. The design is runtime-neutral and is
checked against both Claude's state and OpenCode's (adr-0073), but built on its own. Building OpenCode
first would have put its state and its single-writer guarantee on the model this replaces.

## What stays shared, and what becomes private

Isolating the harness's transcript is not isolating the work. Collaboration already happens in shared
layers, and stays there:

- **The project's work record in hq** — tasks, comments and @mentions, handoffs, records of what ran.
  Agents take part through platform tools such as `create_task`.
- **The project's storage on the site** — files, workspaces, task working files and member folders,
  one live copy.

What becomes private to one person, in one boundary, is only what the harness keeps for them: its raw
transcript, their memory as injected into the prompt, and the credential a run used.

## 1. Containers and homes — approved 2026-09-28

### The container key: boundary × runner

A container is keyed on the storage boundary it serves **and who is running in it**: a person, or the
project itself for runs with nobody behind them (tasks, and later heartbeats).

In a project X with members Alice and Bob, the containers are **Alice × X**, **Bob × X** and
**X × project**. In a person's own storage, the only possible runner is that person, so that container
is today's, unchanged. Heartbeats keep their own key until the heartbeat rework gives them a boundary.

The boundary still decides what a run may reach, and whose authority it acts with: a run in Alice × X
acts as Project X, not as Alice (adr-0060 stands). The runner decides only whose private state sits
beside it.

**Why.** The harness home is exactly what needs isolating, so it has to be keyed on the person. Options
weighed:

- **One container per person, mounting every project they can reach** (the issue's first sketch). Rejected:
  a run in X could read and write Y and the person's own files, and one home would hold the person's
  transcripts from every project side by side — a run acting as X could read their Y conversations.
- **One container per project, with a Linux user per person inside it.** Home folders at `0700` would
  let the kernel keep people apart, with fewer containers and people running at once. Rejected: files
  one user writes in shared storage must stay editable by every other, and git refuses repositories
  owned by another user — the kind of problem that consumes a week — and it is weaker than separate
  containers if an agent ever reaches root.
- **Accept the leak for release.** Rejected: it ships a broken privacy promise.

adr-0057 had already weighed "key on the storage location and the person" and kept it open as the way
to end residue between people's runs. **The cost, accepted by the owner:** containers per site are one
per person's own storage in use, plus active members + 1 per active project. Idle containers are torn
down as today.

### Where the runner comes from

The runner decides whose private home is mounted, so it is a security decision. It comes from hq's
signed run capability, never from the unsigned dispatch payload. Today the capability names the
boundary but not who the run is for; this design adds that claim. The claim records who is
running; it grants nothing, since authority stays with the boundary.

### A container mounts exactly one boundary's storage

One boundary per container is unchanged from adr-0057. Several containers now mount the same
boundary — Alice × X, Bob × X and X × project all mount X — but each mounts only one. Alice × X does
not mount Project Y, nor Alice's personal storage; those are her other containers.

**Access to a boundary is access to all of it.** A container mounts its boundary's folder once —
`/projects/<project id>/` or `/users/<person id>/` — with everything in it: files, knowledge,
artefacts, every workspace, tasks and member folders. A workspace created while a container runs
appears in it straight away. **The workspace access policy is removed**: there is no longer a way to
block agents from one workspace of a project while they work in the rest. Keeping something from
agents is a matter of where it lives — a project they are not added to, or someone's personal storage.
How members of a project coordinate their work inside it is theirs to manage, not the platform's.

**Why.** Per-workspace mounts existed only to enforce that policy (hq/site split, 2026-08-10: blocked
workspaces are never mounted); mounting the folder whole was never weighed against it. The policy's
stated case — a person's own workspace — is already covered, since a person's own storage is a
separate boundary no project container mounts. And with a person's conversations running side by
side, per-workspace mounts became a source of failures: a container's mounts are fixed when it starts,
so creating a workspace forced a rebuild that failed any run still going after a 120-second wait (the
same failure as agents with different workspace caps evicting each other). Options weighed, with the owner on 2026-09-28:

- **Keep the policy, mount once, cover each blocked workspace with an empty mount** — rejected: it
  keeps a feature whose only remaining use (blocking one workspace while agents work in the rest of the
  project) nobody has asked for, and keeps the rebuild path for block and unblock.
- **Keep per-workspace mounts and start a second container per set of mounts** — rejected: the most
  moving parts, for the same unneeded feature.

### Two layers: the project is isolated, a workspace is guarded

Security inside a project has two layers, of different strength:

- **Isolation — the boundary.** The container is what makes a project's edge hold, and what keeps one
  person's harness home from another's. It is enforced by the operating system, so an agent with a
  shell cannot get around it. Anything that must be truly unreachable goes in its own project.
- **A guardrail — the workspace's settings.** A workspace's own settings — its allowed tools, which
  include whether the shell is allowed at all — apply to **runs that work in that workspace**, narrowing the agent's
  permissions and the project's override for it. They let a project owner lock a workspace down. They
  are enforced by the platform's own tool gate, the way a repository's `.claude/settings.json` is
  enforced by the Claude harness — not by the operating system — so they are only as strong as the shell
  rules that apply: with the shell allowed, they are advisory. A workspace has no shell-command
  patterns of its own; those come from the agent and the project's override. Runs working anywhere else in the
  project are not affected by them.

**This changes today's behaviour.** Today hq combines every workspace's allowed tools and applies the
result to every run in the project, so a limit on one workspace narrows work in all of them. That
predates the decision and is the wrong shape for either layer.

**Why.** It is the trade the owner chose on 2026-09-28: sharing a project's storage and context is the
point of a project, so a workspace is guarded rather than isolated, and a project owner who needs
isolation creates another project. Options weighed: dropping workspace settings entirely (rejected — a
project owner loses the means to lock down one workspace), and confining a run to one workspace by
mounts (rejected — it brings back per-run mount sets and the rebuild failures above).

### Container paths mirror the site's disk, by id

A container sees storage at the site's own path with the site root removed:
`/projects/<project id>/files/`, `/projects/<project id>/workspaces/<workspace id>/`, and so on.
**This changes today's behaviour**, where container paths use readable names
(`/projects/project-x/workspaces/web-3f2a91c0/`, `locationResolver.ts`).

**Why.** A harness files a conversation under its working directory. Claude stores each session under
a folder named after it; OpenCode records the directory against the session and keys its undo
snapshots on it. So if the container path of a working directory changes, the harness can no longer
resume the conversation. Readable names change whenever a project or workspace is renamed; ids never
do. Options weighed:

- **Current names** — rejected: renaming a project, an ordinary cosmetic action, would end every
  conversation in it, for everyone, with nothing connecting the two in anyone's mind.
- **A readable name fixed at creation** — rejected by the owner: after a rename the path shows the old
  name, which is inaccurate information and defeats the point of readability.
- **The full host path, site root included** — rejected: it exposes the site's filesystem layout and
  differs between machines, for no gain over removing the root.

Ids are not secret from agents today — a task run's working directory is already `tasks/<task id>/`.
The readers of container paths are mostly agents; people see names through hq, which reads its own
records. The prompt tells the agent each mounted folder's current name.

### Harness homes

Each container gets one harness home: the runtime's own private state for one runner in one boundary.
Homes live on the site's disk **beside** storage, never inside it — project storage is mounted by every
container in the project, so a home inside it would be readable by all of them.

```
<site root>/
  projects/<project id>/…                  ← storage (boundaries)
  users/<person id>/…
  homes/
    users/<person id>/personal/            ← the person, in their own storage
    users/<person id>/<project id>/        ← the person, in a project
    projects/<project id>/                 ← the project's own runs
```

Inside the container a home appears at `/home/appuser/`, the same path in every container, backed by a
different folder on the site. It is runtime-neutral: Claude's state (`.claude/`) and, later, OpenCode's
(`.local/share/opencode/`) sit side by side in it. Whether the whole home is bound at `/home/appuser/`
or only each runtime's folder is settled against the agent image during the build, since binding the
whole folder would hide anything the image keeps there.

**Why this layout.** Grouping by person puts everything private to one person under one folder, which
is what a harness home is — the runner's state, not the boundary's. `homes/users/` and `homes/projects/`
mirror the storage tree's own `users/` and `projects/`. Removing a person from the organisation removes
one folder; removing them from a project removes one below it. `homes/projects/<project id>/` is the
project's own runs' home — never a shared home for members, and never mounted into a member's
container. It already fits the heartbeat rework: a project's heartbeat lands there, a person's own heartbeat in their
`personal/`.

### A run never carries a person's claude.ai connectors

A Claude subscription login brings the claude.ai connectors of the account behind it — Drive, mail and
the like — which act with that person's authority. The harness is started with them turned off, for
every run, in a container or not.

**Why.** Found in the walk-through on 2026-09-28, where a project member's container connected to the
subscription holder's connector. A run's authority comes from its boundary (adr-0060): a project's runs,
tasks included, must not reach one person's accounts, and a person would not expect their mail to be
reachable from a shared project. They also made an agent's tools depend on its credential — present on
a subscription, absent on an API key. The code already meant to block them, with a hand-kept list that
caught only two connectors' sign-in tools. Options weighed with the owner: allowing them in a person's
own chat in their own storage, the one place a run acts as that person (rejected for now — their tools
would still sit outside the tool gate); leaving them (rejected — it leaks). Connections a boundary owns,
made through Agenthix, are queued as their own issue.

### Three different places belong to a person

They are named separately throughout, never as "home":

| | What | Where | Who can reach it |
|---|---|---|---|
| **Personal storage** | The person's own boundary: their files and workspaces | `users/<person id>/` | Only their personal container |
| **Member folder** | Their drafts and agenda in a project (`storage/paths.ts`, close-out spec §6.1) | `projects/<project id>/members/<person id>/`, inside project storage | Everyone in the project, **by design** — private work belongs in personal storage |
| **Harness home** | The runtime's private state | `homes/users/<person id>/…` | Only the one container it is keyed to |

The agenda in the member folder is injected into the person's chat prompts and stays project-visible:
it is work status meant for collaborators, and this design does not change that.

### Existing homes

Today's per-boundary homes are ignored, not converted (pre-release, no migration).

## 2. Running in parallel — approved 2026-09-28

### No queue between runs

Today every run goes through a queue keyed on its boundary (`runQueueKey.ts`, used by `AgentEngine`),
so all of a project's work runs one run at a time. That key becomes **the session**. A conversation's
turns stay in order; everything else runs at once — across people, across one person's conversations
in one container, across tasks, and across subagents, since each subagent is its own session.

**Why.** The owner's comment on the issue: several people and agents must be able to work in a project at the
same time, and queue-locking a project prevents multitasking and creates unacceptable delays. The one
ordering that is necessary is within a conversation, because a harness transcript has one writer —
OpenCode itself refuses two turns of one session at once. That same rule is what makes parallel
subagents safe rather than what stops them.

### Capacity limits stay

The site-wide cap on concurrent runs (`GlobalSlots`, `MAX_CONCURRENT_RUNS`) and the per-container
limits (`containerLimits.ts`: 4 GB of memory, 2 CPUs, 1,024 processes by default) remain. They protect
the machine; they are not an ordering. A container can now run several harness processes at once, so
the defaults may need raising — a sizing choice made in the build, already configurable.

### The reset between runs is unchanged

The between-runs reset (`kill -9 -1` and the scratch wipe) still happens only when a container has no
active run (`containerRuns.ts`). Parallel runs in one container belong to one person in one boundary, so
nothing crosses between people.

The run's credential follows the same rule. Today each run writes its credential into the home and takes
it out when it ends (`boundaryClaudeHome.ts`), which is safe only while one run uses a home at a time.
With parallel runs, the first to finish would remove the credential from under the others, so it is
taken out only when the last run using the home ends.

### Sending into a busy conversation

A **per-user setting** in hq decides what happens to a message sent into a conversation whose turn is
still running: **wait** — queued behind the running turn — or **interrupt** — the running turn is
stopped (Claude's SDK `interrupt`; OpenCode `POST /session/:id/abort`), recorded as interrupted in our
record, and the new message starts. Wait is the default, being today's behaviour.

**Why per user.** It is a working-style preference, not a project rule: some people correct an agent
mid-turn, others let it finish.

### No platform locks on shared files

Conflicting edits in shared project storage are possible, and accepted. Git working trees shared by
concurrent agents trip git's own lock files; teams handle that with branches or worktrees,
helped by seeing what is running where (section 3).

**Why.** The owner's comment: treat concurrency as a collaboration concern — the platform gives
visibility and lets people and teams choose how to coordinate, rather than making the filesystem
transactional for everyone.

### An agent still works one task at a time per project

hq's rule that an agent has at most one running task per project (`TaskRunner.ts`) stays. Different
agents run in parallel; an agent takes its next task when it finishes this one.

**Why.** It is about how task work is handed out, not about containers, and the heartbeat rework (heartbeats that
start the tasks they queue) is already reworking task claiming. Changing it here would split one
decision across two milestones. More parallel work comes from more agents now, and from subagents
later.

## 3. Seeing what's running — approved 2026-09-28

### The same facts, for people and for agents

For every run active in a boundary, the platform surfaces the **agent**, **who or what started it** (a
person's chat, or a task), **where it is working**, and **since when**. People see it on the project in
hq, with a flag when two runs share a workspace. Agents read it through a new platform tool,
`list_active_runs`, served the way `create_task` is.

**Why.** The owner's comment on the issue: concurrency is a collaboration concern, handled with visibility
rather than locks. An agent is as likely as a person to start work in a busy workspace, so it needs the
same view — and may choose to wait until a workspace is clear.

### Scope follows the boundary

A run in Project X sees Project X's runs; a run in a person's own storage sees only that person's own.

**Why.** It is the same rule as what a run may reach (adr-0057) and whose authority it acts with
(adr-0060); a view across boundaries would be a new kind of reach.

### "Working in" is the working directory

It is the workspace, task folder or project files the run started in. A run can still reach every
workspace hq allowed it, so this says where it is working, not that it touches nothing else. Finer
detail — which files a run is touching, subagent trees, task working files — waits for the mock-ups the
owner's comment asks for.

### Where the data comes from

**hq asks the site each time**, and resolves what the site answers against its own records.

The site knows which runs are active — it is running them — but it holds no identity: its session and
run rows carry hq-issued ids (the person, agent, task and boundary), never the records behind them. So
the site answers with ids only — for each active run in a boundary, the run, its session, agent and
task, and when it started — through a narrow read of its own, and hq turns them into names from its
records: the agent, the person from its copy of the session, the task, and the working location. The
read carries nothing of a run's content; `run.list`, which returns whole run rows with their input and
output, is not used for it.

**Why.** It is always accurate: the site is the only party that knows a run is still going. Options
weighed:

- **hq keeps its own list from the start and final status frames** — rejected by the owner: a frame
  lost to a dropped connection leaves a run listed as running, or missing, until something corrects
  it; the site's own answer cannot drift.
- **`run.list` filtered in hq** — rejected: it sends each run's input and output across to answer a
  question that needs neither, and it cannot filter by boundary, so hq would fetch every active run on
  the site and discard most of them.

**The cost:** with the site unreachable, the view and `list_active_runs` fail with the explicit
site-unreachable error every other site read gives, rather than showing a list that may be wrong.

### Existence is visible, content is not

Members learn that Alice has a chat running in workspace *web*; nothing of what she said. This narrows
adr-0041, under which a member cannot tell another member's chat exists at all, so it is recorded as a
decision in section 5 rather than left to the build.

### Nothing is enforced

The view and the tool inform. Agents and people decide whether to wait, use a branch or worktree, or
work elsewhere.

## 4. Lost harness state, and when a person leaves — approved 2026-09-28

### Our session and the harness session share one id

The Claude runtime starts or resumes the harness session under our `AgentSession` id
(`ClaudeSDKRuntime.ts`), so that id is the link between our record and the harness's state. OpenCode is
built the same way.

### Knowing that the harness state is gone: check before launching

Before resuming a conversation, the runtime asks the harness state directly whether the session exists —
for Claude, whether its session file is in the runner's home; for OpenCode, whether `GET /session/:id`
finds it. The site can answer both, since the homes are on its disk. Each runtime implements "does this
session still exist?", and the engine acts on the answer the same way whichever runtime gave it.

**Why not error text, as today.** `isStaleSessionError` matches error strings, one of them the catch-all
`"exited with code 1"`, which also fires on unrelated failures such as a misconfigured MCP server. When
a gone session meant a quiet restart, a false match cost little. Now that it means closing the
conversation, a false match would close a healthy one.

### A conversation whose harness state is gone is closed, visibly

The session gets a new status, `CLOSED`, with a reason, beside today's `ACTIVE`, `EXPIRED` and
`ARCHIVED`. The site sets it, as it already owns session status and replicates it to hq. hq shows the
full history, a notice that the agent no longer has this conversation's context, no message box, and a
*Start a new conversation* button for the same agent. The silent fresh start (`isStaleSessionError`
followed by a new session under the same id, flagged `staleSession`, which nothing in hq reads) is
removed.

**Why.** Today the person sees their whole history while the agent answers from a clean slate, with
nothing telling them. Options weighed: continuing visibly from a clean slate (rejected: the reply is
still disjointed from the history on screen), and rebuilding the harness's context from our record
(rejected for now: it is Agenthix building a harness's context — the job the single-harness proposal argued it should not own —
and lossy; it can come later if closed conversations prove a nuisance).

### A conversation keeps the runtime it started with

A session records its runtime when it is created, in both the site's record and hq's copy. Changing an agent's runtime applies to its new
conversations; existing ones continue in the harness they began in, and nothing closes.

**Why.** Closing them would be wrong: the old harness's state is still in the home, so switching the
agent back would leave resumable conversations closed. What the single-harness proposal's argument requires is that a *conversation* never moves between harnesses; nothing requires an
agent to stay on one runtime. adr-0073 words this as the agent's runtime being fixed for its lifetime,
while adr-0072 lists runtime among an agent's editable settings; section 5 corrects adr-0073.

### When membership ends

- **Leaving a project:** hq tells the site. The site stops the runs in the person's container for that
  project, since their right to it has ended; removes the container; deletes
  `homes/users/<person id>/<project id>/`; and closes their conversations there.
- **Leaving the organisation:** the same for every project, and `homes/users/<person id>/` as a whole.
- **Deleting a project:** the project's own home and every member's home for it.
- **A site that is offline:** hq keeps the instruction and sends it when the site reconnects — the
  pattern it already uses to hold tasks while a site is down.
- **Untouched:** the person's member folder, which is project data, and our record of their
  conversations. How long those are kept after someone leaves is a question of its own.

### Why our record is kept but the harness's copy is not

They do different jobs. hq's chat view reads only our record (`TranscriptEntry`, with `ToolCallLog` and `AgentRun`), over the control channel; it
cannot read harness files. Our record is runtime-neutral, carries what only Agenthix knows (which run,
agent, person and task; what the authorization gate allowed or blocked; risk ratings), and leaves out
the injected memory. The harness's copy is in a format Agenthix does not own, may be pruned (OpenCode
prunes old tool output during compaction), holds the full prompt with the person's memory, and exists
only so the harness can resume. Deleting it loses the ability to continue, not the history. How long our records are kept after someone leaves is a question of its own.

## 5. Decision records, scope, and how it is built — approved 2026-09-28

### Decision records

Kept short; this spec holds the design.

- **New ADR — a container is keyed on its boundary and its runner.** Supersedes adr-0057: one boundary
  per container stands; the runner joins the key, harness homes live outside storage, and container
  paths mirror the disk by id.
- **New ADR — work in a boundary runs in parallel; only a conversation is ordered.** No platform locks;
  visibility instead.
- **New ADR — a conversation whose harness state is gone is closed, never silently restarted.** A rule
  every future runtime must honour.
- **New ADR — within a boundary, a chat's existence is visible; its content is not.** That a chat is
  running, its agent, who started it, where it is working and since when are visible to members; its
  content, title included, is not. Supersedes the affected section of adr-0041 only.
- **New ADR — a conversation keeps the runtime it started with.** An agent's runtime is an editable
  setting (adr-0072) that applies to new conversations. Supersedes the affected section of adr-0073 only.

**Why new records rather than revisions.** A record is annotated, never revised: one decision inside
an earlier record is superseded by a record of its own, and the earlier record marks the section it
replaces. adr-0041's own note says its one revision should have been its own record.

### In scope

- The runner claim in the run capability, the container key, harness homes, and id-based
  container paths
- The per-session queue, the wait-or-interrupt user setting, and container sizing
- The running-now view in hq and the `list_active_runs` platform tool
- The pre-launch existence check, `CLOSED`, the closed-conversation UI, and sessions pinned to their
  runtime
- Membership-end cleanup, including instructions held for an offline site
- A protocol version bump for the new claim and messages
- Removing the workspace access policy, mounting each boundary's folder once, and applying a workspace's
  settings only to runs working in it (§1)
- The OpenCode container spike

### Out of scope

| What | Where it belongs |
|---|---|
| Richer visibility — files a run touches, subagent trees, task working files | After mock-ups, as the owner's comment on the issue asks |
| Lifting one task per agent per project; heartbeat containers | The heartbeat rework |
| How long records are kept after someone leaves | Its own issue |
| Recording several locations per session | Its own issue |
| Rebuilding a harness's context from our record | Later, if closed conversations prove a nuisance |
| Git's lock files in shared working trees | Its own issue |
| Sandboxed workspaces — confining a run's commands to its workspace with Claude's sandbox | Its own issue: it runs in our container only with the container's own protections loosened |

### The OpenCode spike

Run in the design phase; its code is thrown away. OpenCode runs in the agent container with its data
directory inside a harness home, a free OpenRouter model that handles tool calls reliably (named, not
auto-routed), and the platform MCP server attached; the container is killed, a new one started, and the
session resumed. It confirms that OpenCode's state works from a per-person home, that resume survives a
new container at the same id paths, and that `GET /session/:id` is a reliable existence check. It also
confirms where Claude files a session, for Claude's existence check.

**Why.** The design is built as Agenthix's own abstraction, not around OpenCode; the spike checks that
the abstraction fits the planned second runtime, on the one thing documentation cannot settle — how it
behaves in our container.

### How it is built: parallel lanes

The milestone keeps its 7 days, and parallel work is how it aims to meet them. The shared contract lands
first — the runner claim, the container-key and session types, the new control-channel messages, and
the protocol bump — because every lane builds on it. Then independent lanes run in parallel, each on
its own branch and each worked by a background agent, with the lead as the bridge between them. Agents
do not run tests; the integration and cross-app suites run once, over all lanes combined, because they
share fixed ports and one test database. Lanes 1 and 3 both touch the site's session and launch code,
so the plan either draws that boundary precisely or sequences them.

**Every agent is given the model its work needs, passed explicitly** — the least capable model that can
do it well, as the repository's own guidance says. Opus where the work is a security boundary, a race or
a decision; Sonnet where it is bounded.

| Work | Model | Why |
|---|---|---|
| Shared contract | Opus | The security claim every lane trusts |
| Lane 1 — containers and homes | Opus | The isolation boundary itself |
| Lane 2 — running in parallel | Opus | Concurrency and races |
| Lane 3 — closing conversations | Opus | A wrong answer closes a healthy conversation or keeps a dead one |
| Lane 4 — visibility: hq view and `list_active_runs` | Sonnet | Reads existing data, scoped by an existing rule |
| Lane 5 — membership ending | Opus | Deletes private data; replays instructions after a reconnect |
| Lane 6 — the wait-or-interrupt setting | Sonnet | A stored preference and a switch |
| OpenCode spike | Sonnet | Bounded and throwaway |
| Drafting the ADRs | Opus | Wording later work must honour |

**Why.** The owner's direction: speed comes from running independent work in parallel, as in earlier
phases, and each agent must be matched to its task rather than inheriting the lead's model.
