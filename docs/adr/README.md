---
name: ADRs
description: This codebase's architecture decision records — every ADR, its title, and its state.
created: 2026-08-09
updated: 2026-10-24
author: leang
---

# Architecture Decision Records

Decisions that bind **this codebase** — hq, the Execution Site and what they share: agent runtime, workspace, tasks, connectors, and the rest of the product's own mechanism. Decisions that bind more than this codebase are recorded outside this repository.

**Next number: `adr-0149`.** A number is claimed once and never reused, including by one later retired.

**Flat, and records never move.** A superseded record stays in the sequence — its state lives in the file, not in where it sits.

**Numbers are not chronological in the early batch.** adr-0009 was written after adr-0010 and adr-0011 and supersedes both, which reads backwards until you check. Records from that period carry no date field, so their order is only recoverable from what each one says.

## Numbers with no record, and why

| Number | Why |
|---|---|
| 0027 | Retired 2026-08-21. It held no architecture decision — it proposed per-agent git commit authorship, which binds nothing outside itself and reverses at the cost of one file. The work is queued, carrying the alternatives the record weighed; the record itself stays in git history. The convention it specified is written up in [github-commit-authorship.md](../concepts/workspace/github-commit-authorship.md), flagged there as not built. |
| 0054 | Retired 2026-08-21. It was written retrospectively during the 2026-08-19 audit, reconstructing from code a decision nobody had recorded. On review that is not what a record is for: its four sections described how the code is arranged, and its options were inferred after the fact rather than weighed by anyone at the time. **Retrospective description belongs in architecture**, so the surface it described is [`architecture/mcp/tools.md`](../architecture/mcp/tools.md), which now also carries why that shape was taken over the alternatives. `adr-0022`, which it had amended, returns to `Accepted` with its two sections annotated in place. |
| 0006 | Retired 2026-08-30. Never accepted, so it never bound anything — a design nobody committed to, which is a proposal rather than a record. The OpenClaw-derived model it set out is carried in full by a proposal, closed as not planned, where it stays visible to anyone who might propose it again. Every load-bearing part of it was decided otherwise: `adr-0025`, `adr-0020`, `adr-0039` and `adr-0049`. |
| 0052 | Retired 2026-08-30. Never accepted, for the same reason as 0053 and answering a narrower slice of the same question. Nothing unique is lost: the proposal for the same question states that everything this record described is carried forward there. A second copy of it would be a second register to keep in step. |
| 0053 | Retired 2026-08-30. It was `Proposed` — a state the framework no longer has — and it was a weighed design for work nobody had committed to, ending with a section titled *"Before this can be accepted"*. That is a **proposal**, which is an issue, not a record. The design moved intact to a proposal, which is where the question now sits; nothing about it changed but the shelf. |
| 0043 | Cited by earlier specs in this codebase for a decision recorded outside it, on cross-org federation. Reusing the number here would be legal but would produce a confident misread every time someone greps. (0042 was held the same way until the HQ / Execution Site ownership decision was recorded here as [ADR-0042](adr-0042-hq-is-the-orgs-own.md).) |
| 0002–0003, 0007, 0012–0014, 0028–0029, 0033–0034 | Never claimed. |

## Decisions recorded outside this repository

Two decisions are cited by this codebase without living in it. **This repository is public and the record is not**, so neither is named or linked here — a link would resolve for whoever has both and be dead for everyone else, and naming where it lives tells a public reader about a repository they cannot see. Describe the decision instead; the reader who needs it has access.

| The decision | Cited by |
|---|---|
| The archived platform model that preceded HQ and Execution Sites | adr-0016, adr-0017 |
| Cross-org federation, still a draft | the hq/site module split specs, as out of scope |

**Number 0043 is held unused here** for the second, so that a bare `adr-0043` in this codebase never resolves to a different local record. HQ as the organisation's source of truth is this repository's own record, [ADR-0042](adr-0042-hq-is-the-orgs-own.md).

## Writing one

A record captures one settled choice between options that later work must honour, and
nothing else — not a design, not a plan, not a known gap. Write it short: the context, the
decision, and what follows from it. To supersede or amend, follow the transitions below.

Two things are this folder's own:

- **Take the number from "Next number" above**, and add the index row in the same commit.
- **Where the arrangement goes when it is kept out of a record:** the unit's design spec
  under `../../work/`, or [`../architecture/`](../architecture/) and
  [`../concepts/`](../concepts/README.md) for what describes the present. Never a path
  under `execution/` or `.scratchpad/` — those are gitignored and dead to anyone who
  clones this repository.

## What the states mean

| State | Means |
|---|---|
| **Accepted** | Agreed and in force |
| **Superseded by `<id>`** | Was accepted, and the named record replaced it |
| **Deprecated** | Was accepted, no longer applies, and nothing replaced it |

**There is no `Rejected` state.** It was only ever reachable from `Proposed` — a record written, then declined or overtaken before anyone accepted it. With records born `Accepted` there is no such moment: an option weighed and declined belongs in the *Options considered* of the record that won, a design nobody committed to is a proposal, and a decision *not* to do something is an accepted record whose answer is no.

**There is no `Proposed` state.** A record is born `Accepted`: a design nobody has committed to
is a **proposal**, which is an issue on this repository, and a design being worked up belongs to
its unit of work. There is no `Withdrawn` state either — withdrawing presupposes something in
flight to pull back, and a record never occupies such a state.

The transitions, who holds each, and what may still change after acceptance are set out above.

**Some records hold more than one decision, and those get a row each.** Records written before
the one-decision rule behave more like design specs. Rather than rewrite them, each decision that
stands on its own is listed separately and addressed `adr-XXXX-s-N` — `s` for section, `N` its
number within the record. A section row carries its own state, so one decision inside a record can
be closed while the rest of the record stays in force. The parent keeps its own row, and stays
`Accepted` while any part of it holds.

**A section earns a row only if it would stand as a record on its own** — changing it would leave
the parent standing, and it clears the bar in its own right. Most sections do not, and are not
listed: they elaborate the record's single decision, or they describe an arrangement, which is not
a decision at any altitude.

## How to read this folder

**Filter on state; do not read it front to back.** A long run of records in date order is not a document,
and reading them that way produces a picture of the system assembled from several different years
at once.

**`Accepted` is what binds you.** Those records, and those section rows, are the constraints
anything built here has to honour. That is the only reading most people ever need.

**Read a closed record to understand code of its own vintage**, not to learn how the system works
today. `Superseded` and `Deprecated` records are kept because the option each weighed is what
stops it being re-proposed by someone who does not know it was already tried — and because code
written while they were in force still reads the way they describe.

**A record is frozen, so its context ages and its decision does not.** A record may describe how
things were arranged when the choice was made; that description is not maintained, and where it
has gone badly wrong it carries a dated annotation saying so.

**For how the system works now, read [`../architecture/`](../architecture/README.md)**, which
describes the system as the code stands and cites the code, and [`../concepts/`](../concepts/README.md)
for the domain model. Both are maintained; a record answers *why*.

**An annotation never changes a decision.** It corrects a claim that has become untrue, or notes a
risk that later resolved. What changes a decision is another record.

## Index

| ADR | Title | State |
|-----|-------|-------|
| [ADR-0001](adr-0001-agent-prompt-building-ownership.md) | Agent Prompt Building Ownership | Accepted |
| [ADR-0004](adr-0004-workspace-centric-agent-architecture.md) | Workspace-Centric Agent Architecture | Accepted |
| [ADR-0004-s-2](adr-0004-workspace-centric-agent-architecture.md#2-agent-templates-vs-agent-instances) | ↳ Agent templates and per-workspace instances | Superseded by adr-0025 |
| [ADR-0004-s-3](adr-0004-workspace-centric-agent-architecture.md#3-channels-and-workspace-access) | ↳ Channels and workspace access | Deprecated |
| [ADR-0004-s-5](adr-0004-workspace-centric-agent-architecture.md#5-mission-based-execution) | ↳ Mission-based execution | Superseded by adr-0030 |
| [ADR-0004-s-6](adr-0004-workspace-centric-agent-architecture.md#6-workspace-execution-queue) | ↳ The workspace execution queue | Superseded by adr-0049 |
| [ADR-0005](adr-0005-pivot-to-nodejs-server-architecture.md) | Pivot to Node.js Server Architecture | Accepted |
| [ADR-0008](adr-0008-hybrid-storage-model.md) | Hybrid Storage Model | Deprecated |
| [ADR-0009](adr-0009-fast-track-engine.md) | Fast-Track Agent Engine | Accepted |
| [ADR-0010](adr-0010-background-agent-loop.md) | Background Agent Loop | Superseded by adr-0009 |
| [ADR-0011](adr-0011-realtime-streaming.md) | Real-time Streaming via WebSockets | Accepted |
| [ADR-0015](adr-0015-mcp-agent-connections-at-site.md) | MCP agent connections at the Site | Superseded by adr-0022 |
| [ADR-0016](adr-0016-sites-and-connectors-as-separate-identities.md) | Sites and Connectors as Separate Provisioned Identities | Superseded by adr-0022 |
| [ADR-0017](adr-0017-agent-execution-as-site-concern.md) | Agent Execution is a Site Concern | Accepted |
| [ADR-0018](adr-0018-mcp-key-as-site-credential.md) | MCP Key as a Site Credential | Superseded by adr-0022 |
| [ADR-0019](adr-0019-agent-runtime-abstraction.md) | Agent Runtime Abstraction and Claude Agent SDK Integration | Accepted |
| [ADR-0020](adr-0020-task-delegation-over-spawn-agent.md) | Multi-Agent Orchestration — Task Delegation First, Sub-Agents Deferred | Accepted |
| [ADR-0021](adr-0021-agent-project-binding.md) | Agent-Project Binding, Containerisation, and Security Boundaries | Superseded by adr-0023 |
| [ADR-0022](adr-0022-remove-mcp-claudesdkruntime-is-canonical.md) | Remove MCP — ClaudeSDKRuntime is the Canonical Execution Path | Accepted |
| [ADR-0023](adr-0023-org-scoped-agent-identity.md) | Org-Scoped Agent Identity with Per-Project Workspaces | Superseded by adr-0024 |
| [ADR-0024](adr-0024-board-scoped-primary-agent.md) | Board-Scoped Primary Agent Identity | Superseded by adr-0025 |
| [ADR-0025](adr-0025-agent-identity-as-first-class-org-member.md) | Agent Identity as First-Class Org Member | Accepted |
| [ADR-0025-s-2](adr-0025-agent-identity-as-first-class-org-member.md#2-agent-has-its-own-persistent-workspace) | ↳ The workspace belongs to the agent | Accepted |
| [ADR-0025-s-3](adr-0025-agent-identity-as-first-class-org-member.md#3-agents-are-project-members) | ↳ Agents are project members | Accepted |
| [ADR-0025-s-5](adr-0025-agent-identity-as-first-class-org-member.md#5-sub-agents-are-bound-to-their-parent-agent) | ↳ Sub-agents are bound to their parent | Deprecated |
| [ADR-0025-s-6](adr-0025-agent-identity-as-first-class-org-member.md#6-heartbeat-is-agent-scoped) | ↳ The heartbeat is agent-scoped | Superseded by adr-0087 |
| [ADR-0025-s-9](adr-0025-agent-identity-as-first-class-org-member.md#9-single-session-execution-and-task-sequencing) | ↳ One execution session per agent | Superseded by adr-0049 |
| [ADR-0026](adr-0026-workspace-file-serving.md) | Workspace File Serving via Site HTTP Endpoints | Accepted |
| [ADR-0030](adr-0030-task-scoped-agent-sessions.md) | Task-Scoped Agent Sessions | Accepted |
| [ADR-0031](adr-0031-project-workspaces-and-roadmap-memory.md) | Project Workspaces and Roadmap-Based Planning Memory | Accepted |
| [ADR-0031-s-1](adr-0031-project-workspaces-and-roadmap-memory.md#project-workspaces) | ↳ A project has shared storage its agents work in | Accepted |
| [ADR-0031-s-2](adr-0031-project-workspaces-and-roadmap-memory.md#the-project-roadmap) | ↳ The roadmap carries planning memory | Accepted |
| [ADR-0031-s-3](adr-0031-project-workspaces-and-roadmap-memory.md#two-phase-heartbeat) | ↳ The two-phase heartbeat | Superseded by adr-0032 |
| [ADR-0032](adr-0032-agent-execution-flow-convergence.md) | Agent Execution Flow Convergence | Accepted |
| [ADR-0032-s-1](adr-0032-agent-execution-flow-convergence.md#agent-as-router) | ↳ The agent is the router (its *Agent as router* section) | Superseded by adr-0087 |
| [ADR-0032-s-5](adr-0032-agent-execution-flow-convergence.md#heartbeat-session-is-agent-scoped-and-persistent) | ↳ The heartbeat session is agent-scoped and persistent | Superseded by adr-0087 |
| [ADR-0035](adr-0035-test-data-isolation.md) | Test-Data Isolation — Dedicated Test Database | Accepted |
| [ADR-0036](adr-0036-context-centric-security.md) | Context-Centric Security: Run Context as the Permission Boundary | Accepted |
| [ADR-0036-s-1](adr-0036-context-centric-security.md#1-data-ownership-is-separated-from-the-agent) | ↳ An agent owns no business or user data | Accepted |
| [ADR-0036-s-4](adr-0036-context-centric-security.md#4-runtimes-are-session-task-scoped-not-agent-lifetime) | ↳ Runtimes are scoped per context | Superseded by adr-0049 |
| [ADR-0036-s-5](adr-0036-context-centric-security.md#5-memory-writes-are-scope-classified) | ↳ Memory writes are scope-classified | Superseded by adr-0048 |
| [ADR-0037](adr-0037-connectors-environments-and-scripts.md) | Agent Operations: Connectors, Environments, and Approved Workflows | Accepted |
| [ADR-0037-s-2](adr-0037-connectors-environments-and-scripts.md#2-connector-a-scoped-pre-coded-external-service-integration) | ↳ Connector — a scoped stored credential the agent never sees | Accepted |
| [ADR-0037-s-3](adr-0037-connectors-environments-and-scripts.md#3-environment-named-variable-sets-that-map-to-github-environments) | ↳ Environments map to GitHub Environments; no secret value is stored | Superseded by adr-0147 |
| [ADR-0037-s-4](adr-0037-connectors-environments-and-scripts.md#4-operation-an-approved-github-actions-workflow-the-agent-authors) | ↳ An operation is an approved workflow the agent authors | Superseded by adr-0147 |
| [ADR-0037-s-6](adr-0037-connectors-environments-and-scripts.md#6-secret-hiding-stance-realised-by-github) | ↳ The agent never sees a secret value | Superseded by adr-0148 |
| [ADR-0037-s-7](adr-0037-connectors-environments-and-scripts.md#7-gates-separation-of-duties) | ↳ Author, approve and invoke are separate gates | Superseded by adr-0148 |
| [ADR-0037-s-8](adr-0037-connectors-environments-and-scripts.md#8-execution-backend-github-actions) | ↳ GitHub Actions is the execution backend | Superseded by adr-0147 |
| [ADR-0038](adr-0038-workspace-as-storage-entity.md) | Workspace as the Storage Entity, Separate from Project (Work) | Superseded by adr-0039 |
| [ADR-0039](adr-0039-files-and-workspaces.md) | Files and Workspaces: Nested Storage with Permanent Ownership | Accepted |
| [ADR-0039-s-1](adr-0039-files-and-workspaces.md#1-two-storage-kinds-per-owner-files-and-workspaces) | ↳ Every owner has one `files/` and zero or more `workspaces/` | Accepted |
| [ADR-0039-s-2](adr-0039-files-and-workspaces.md#2-nested-storage-keyed-by-immutable-id) | ↳ Storage is nested by owner and keyed by immutable id | Accepted |
| [ADR-0039-s-3](adr-0039-files-and-workspaces.md#3-permanent-ownership-relocation-is-an-explicit-copymove) | ↳ Ownership is permanent; relocation is an explicit move | Accepted |
| [ADR-0039-s-5](adr-0039-files-and-workspaces.md#5-github-is-a-reusable-repo-attachment-not-a-property-of-one-entity) | ↳ GitHub is an attachment keyed by a storage target | Accepted |
| [ADR-0039-s-6](adr-0039-files-and-workspaces.md#6-the-wiki-dissolves-the-default-workspace-is-removed) | ↳ The wiki and the default Workspace are removed | Accepted |
| [ADR-0039-s-8](adr-0039-files-and-workspaces.md#8-sessions-attach-to-a-storage-location-as-cwd-scratch-is-a-subdir) | ↳ A session's cwd is a storage location; scratch is a subdir | Accepted |
| [ADR-0039-s-10](adr-0039-files-and-workspaces.md#10-a-third-storage-kind-tasks-and-the-task-run-access-model) | ↳ `tasks/` as a third storage kind, and the task-run access model | Accepted |
| [ADR-0040](adr-0040-hq-issued-token-ttls.md) | HQ-Issued Token Lifetimes | Accepted |
| [ADR-0041](adr-0041-chat-session-privacy.md) | Chat Sessions Are Private to Their Owner | Accepted |
| [ADR-0041-s-1](adr-0041-chat-session-privacy.md#revision--2026-08-11-agentsession-moves-to-site-and-hq-keeps-a-copy) | ↳ `AgentSession` is canonical on site; hq keeps a copy | Accepted |
| [ADR-0041-s-2](adr-0041-chat-session-privacy.md#decision) | ↳ A chat is private to its owner and hidden from other members (its Decision section) | Superseded by adr-0077 |
| [ADR-0042](adr-0042-hq-is-the-orgs-own.md) | An org's HQ is its own — `site` splits into `hq` and `site` | Accepted |
| [ADR-0044](adr-0044-execution-site-registration-flow.md) | Execution Site Registration Flow | Accepted |
| [ADR-0044-s-1](adr-0044-execution-site-registration-flow.md#decision) | ↳ Registration is token-upfront | Superseded by adr-0064 |
| [ADR-0045](adr-0045-request-response-on-the-control-channel.md) | Request/Response on the Existing Control-Channel Protocol | Accepted |
| [ADR-0046](adr-0046-protocol-compatibility-between-hq-and-sites.md) | Protocol Compatibility Between hq and Execution Sites | Superseded by adr-0136 |
| [ADR-0047](adr-0047-where-a-run-may-execute.md) | Where a Run May Execute | Superseded by adr-0056 |
| [ADR-0048](adr-0048-partitioning-an-agents-memory-of-a-person.md) | Partitioning an Agent's Memory of a Person | Superseded by adr-0058 |
| [ADR-0049](adr-0049-the-session-is-the-container-boundary.md) | The Session Is the Container Boundary | Superseded by adr-0057 |
| [ADR-0050](adr-0050-dispatch-and-status-cross-the-control-channel.md) | Dispatch and Status Cross the Control Channel | Accepted |
| [ADR-0051](adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) | Live Site Data Crosses as Typed Events, Not a Generic Relay | Accepted |
| [ADR-0055](adr-0055-an-external-issue-is-a-source-of-work-not-a-task.md) | An External Issue Is a Source of Work, Not an Agenthix Task | Accepted |
| [ADR-0056](adr-0056-a-run-is-placed-on-the-site-holding-its-storage.md) | A Run Is Placed on the Site Holding Its Storage | Accepted |
| [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) | A Container Is Bound to One Storage Location | Superseded by adr-0074 |
| [ADR-0058](adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md) | Memory of a Person Is Held by hq, in Two Layers | Accepted |
| [ADR-0058-s-1](adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md#decision) | ↳ Two layers, crossed only by promotion, delivered whole in every run (its *Decision*) | Superseded by adr-0122 |
| [ADR-0059](adr-0059-an-agent-is-a-versioned-package.md) | An Agent Is a Versioned Package | Superseded by adr-0072 |
| [ADR-0060](adr-0060-authority-comes-from-the-boundary.md) | Authority Comes from the Boundary, Never a Union | Accepted |
| [ADR-0061](adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) | A Product and a Programme Group Work and Own Nothing | Accepted |
| [ADR-0062](adr-0062-people-are-members-agents-are-assigned.md) | People Are Members; Agents Are Assigned | Accepted |
| [ADR-0063](adr-0063-preview-traffic-crosses-on-its-own-transport.md) | Preview Traffic Crosses on Its Own Transport | Accepted |
| [ADR-0064](adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md) | A Site Registers with Its Installer's and an Admin's Consent | Superseded by adr-0115 |
| [ADR-0065](adr-0065-a-site-serves-no-web-page.md) | A Site Has No Operator Page | Accepted |
| [ADR-0066](adr-0066-a-site-reaches-its-agents-over-a-private-network-per-boundary.md) | A Site Reaches Its Agents over a Private Network per Boundary | Accepted |
| [ADR-0067](adr-0067-hq-ends-at-one-plain-http-port.md) | hq Ends at One Plain-HTTP Port | Accepted |
| [ADR-0068](adr-0068-hqs-browser-app-is-built-for-its-address.md) | hq's Browser App Is Built for Its Address | Superseded by adr-0111 |
| [ADR-0069](adr-0069-images-are-built-with-only-docker.md) | Images Are Built with Only Docker | Accepted |
| [ADR-0070](adr-0070-hq-and-its-own-site-are-connected-by-configuration.md) | hq and Its Own Site Are Connected by Configuration | Accepted |
| [ADR-0071](adr-0071-a-preview-is-served-from-its-own-host-name.md) | A Preview Is Served from Its Own Host Name | Accepted |
| [ADR-0072](adr-0072-an-agent-is-defined-once-in-hq-and-overridden-per-boundary.md) | An Agent Is Defined Once in hq and Overridden per Boundary | Accepted |
| [ADR-0073](adr-0073-claude-keeps-its-own-runtime-opencode-replaces-nativeruntime.md) | Claude Keeps Its Own Runtime; OpenCode Replaces NativeRuntime | Accepted |
| [ADR-0073-s-1](adr-0073-claude-keeps-its-own-runtime-opencode-replaces-nativeruntime.md#decision) | ↳ Every agent's runtime is fixed for its lifetime (its Decision section) | Superseded by adr-0078 |
| [ADR-0074](adr-0074-a-container-is-keyed-on-its-boundary-and-its-runner.md) | A Container Is Keyed on Its Boundary and Its Runner | Accepted |
| [ADR-0075](adr-0075-work-in-a-boundary-runs-in-parallel-only-a-conversation-is-ordered.md) | Work in a Boundary Runs in Parallel; Only a Conversation Is Ordered | Accepted |
| [ADR-0076](adr-0076-a-conversation-whose-harness-state-is-gone-is-closed.md) | A Conversation Whose Harness State Is Gone Is Closed, Never Silently Restarted | Accepted |
| [ADR-0077](adr-0077-within-a-boundary-a-running-chat-is-visible-its-content-is-not.md) | Within a Boundary, a Running Chat Is Visible; Its Content Is Not | Accepted |
| [ADR-0078](adr-0078-a-conversation-keeps-the-runtime-it-started-with.md) | A Conversation Keeps the Runtime It Started With | Accepted |
| [ADR-0078-s-1](adr-0078-a-conversation-keeps-the-runtime-it-started-with.md#decision) | ↳ An agent's runtime is an editable setting (its Decision, second paragraph) | Superseded by adr-0139 |
| [ADR-0079](adr-0079-access-to-a-boundary-is-access-to-all-of-it.md) | Access to a Boundary Is Access to All of It; a Workspace's Settings Are a Guardrail | Accepted |
| [ADR-0080](adr-0080-a-run-never-carries-a-persons-own-connected-accounts.md) | A Run Never Carries a Person's Own Connected Accounts | Accepted |
| [ADR-0081](adr-0081-a-harness-runs-the-way-its-vendor-intends.md) | A Harness Runs the Way Its Vendor Intends, and Stays Warm While Its Conversations Are Live | Accepted |
| [ADR-0082](adr-0082-a-conversation-acts-with-its-current-turns-authority.md) | A Conversation Acts With Its Current Turn's Authority, and None Between Turns | Accepted |
| [ADR-0083](adr-0083-a-process-belongs-to-the-conversation-that-started-it.md) | A Process Belongs to the Conversation That Started It | Accepted |
| [ADR-0084](adr-0084-an-agents-skills-are-staged-by-agenthix-per-turn.md) | An Agent's Skills Are Staged by Agenthix per Turn, Never Taken from a Harness's Own Discovery | Accepted |
| [ADR-0085](adr-0085-agenthix-owns-a-harness-file-tools-where-it-can-be-a-confused-deputy.md) | Agenthix Owns a Harness's File Tools Where the Harness Can Be Made Its Agent's Confused Deputy | Accepted |
| [ADR-0086](adr-0086-the-execution-site-is-a-plain-node-server.md) | The Execution Site Is a Plain Node Server | Accepted |
| [ADR-0087](adr-0087-work-starts-on-its-own-only-from-a-boundarys-automation.md) | Work Starts on Its Own Only from a Boundary's Automation, Never from an Agent | Accepted |
| [ADR-0087-s-1](adr-0087-work-starts-on-its-own-only-from-a-boundarys-automation.md#decision) | ↳ A routine is a scheduled or repeating task (its *Decision*, "It has two parts") | Superseded by adr-0092 |
| [ADR-0088](adr-0088-one-scheduler-in-hq-starts-every-automated-start.md) | One Scheduler in hq Starts Every Automated Start | Accepted |
| [ADR-0089](adr-0089-every-task-runs-on-behalf-of-a-person.md) | Every Task Runs on Behalf of a Person | Accepted |
| [ADR-0089-s-1](adr-0089-every-task-runs-on-behalf-of-a-person.md#decision) | ↳ The task's person answers every approval (its *Decision*, "That person answers its approvals") | Superseded by adr-0095 |
| [ADR-0090](adr-0090-a-connection-to-hq-is-a-persons-own.md) | A Connection to hq Is a Person's Own | Accepted |
| [ADR-0091](adr-0091-work-agents-cause-is-bounded-by-its-depth.md) | Work Agents Cause Is Bounded by Its Depth, Not Its Pace | Accepted |
| [ADR-0092](adr-0092-a-routine-is-its-own-thing-that-creates-tasks.md) | A Routine Is Its Own Thing That Creates Tasks | Accepted |
| [ADR-0092-s-1](adr-0092-a-routine-is-its-own-thing-that-creates-tasks.md#decision) | ↳ At its time a round obeys its board (its *Decision*, third point) | Superseded by adr-0104 |
| [ADR-0093](adr-0093-hq-is-organised-by-feature.md) | hq Is Organised by Feature, Each Feature Declaring Itself | Accepted |
| [ADR-0094](adr-0094-hq-operations-are-tested-against-the-real-database.md) | hq's Operations Are Tested Against the Real Database | Accepted |
| [ADR-0095](adr-0095-a-run-is-on-behalf-of-whoever-started-it.md) | A Run Is on Behalf of Whoever Started It | Accepted |
| [ADR-0096](adr-0096-a-conversation-belongs-to-a-place.md) | A Conversation Belongs to a Place | Accepted |
| [ADR-0097](adr-0097-a-board-is-a-lasting-workflow.md) | A Board Is a Lasting Workflow | Accepted |
| [ADR-0098](adr-0098-a-task-has-a-plan-apart-from-its-schedule.md) | A Task Has a Plan Apart From Its Schedule | Accepted |
| [ADR-0099](adr-0099-an-open-project-is-open-to-join.md) | An Open Project Is Open to Join | Accepted |
| [ADR-0100](adr-0100-leaving-deactivates-erasing-is-separate.md) | Leaving Deactivates; Erasing Is Separate | Accepted |
| [ADR-0101](adr-0101-a-run-is-bounded-by-the-person-it-is-for.md) | A Run Is Bounded by the Person It Is For | Accepted |
| [ADR-0102](adr-0102-viewer-is-a-project-role.md) | Viewer Is a Project Role | Accepted |
| [ADR-0103](adr-0103-a-team-joins-a-project-as-one-member.md) | A Team Joins a Project as One Member | Accepted |
| [ADR-0104](adr-0104-a-routines-round-starts-at-its-time.md) | A Routine's Round Starts at Its Time | Accepted |
| [ADR-0105](adr-0105-a-run-uses-the-login-of-the-person-it-is-for.md) | A Run Uses the Login of the Person It Is For | Superseded by adr-0139 |
| [ADR-0106](adr-0106-each-service-keeps-its-own-logs.md) | Each Service Keeps Its Own Logs | Accepted |
| [ADR-0107](adr-0107-the-host-service-alone-holds-a-machines-authority.md) | The Host Service Alone Holds a Machine's Authority | Accepted |
| [ADR-0108](adr-0108-a-machine-carries-at-most-one-hq-and-one-site.md) | A Machine Carries at Most One HQ and One Site | Accepted |
| [ADR-0108-s-1](adr-0108-a-machine-carries-at-most-one-hq-and-one-site.md#decision) | ↳ A site and its machine are named apart, and a moved site keeps its name (its *Decision*, second sentence) | Superseded by adr-0120 |
| [ADR-0109](adr-0109-the-host-manager-is-a-site-that-signs-its-commands.md) | The Host Manager Is a Site That Signs Its Commands | Accepted |
| [ADR-0110](adr-0110-fleet-admin-is-a-role-on-hq-accounts.md) | Fleet Admin Is a Role on HQ Accounts | Accepted |
| [ADR-0111](adr-0111-hqs-browser-app-takes-its-address-when-it-starts.md) | HQ's Browser App Takes Its Address When It Starts | Accepted |
| [ADR-0112](adr-0112-every-backup-is-sealed-its-key-held-by-a-machine.md) | Every Backup Is Sealed, Its Key Held by a Machine | Accepted |
| [ADR-0113](adr-0113-a-moved-hqs-sites-follow-it-by-challenge-response.md) | A Moved HQ's Sites Follow It by Challenge–Response | Accepted |
| [ADR-0114](adr-0114-uploaded-files-are-served-from-their-own-origin.md) | Uploaded Files Are Served From Their Own Origin | Accepted |
| [ADR-0115](adr-0115-a-site-takes-part-when-a-fleet-admin-or-cloud-adds-it.md) | A Site Takes Part When a Fleet Admin or Cloud Adds It | Accepted |
| [ADR-0116](adr-0116-a-feature-not-ready-ships-behind-a-flag.md) | A Feature Not Ready Ships Behind a Flag | Accepted |
| [ADR-0117](adr-0117-a-host-service-runs-only-signed-published-images.md) | A Host Service Runs Only Signed, Published Images | Accepted |
| [ADR-0118](adr-0118-a-host-service-replaces-itself-through-a-launcher.md) | A Host Service Replaces Itself Through a Launcher | Accepted |
| [ADR-0119](adr-0119-a-sites-backup-carries-its-authority.md) | A Site's Backup Carries Its Authority | Accepted |
| [ADR-0120](adr-0120-a-site-is-named-after-its-machine.md) | A Site Is Named After Its Machine | Accepted |
| [ADR-0121](adr-0121-a-conversations-record-is-in-hq-and-its-lead-is-direct-inference.md) | A Conversation's Record Is in hq, and Its Lead Is Direct Inference | Accepted |
| [ADR-0122](adr-0122-memory-is-recalled-by-meaning-in-three-scopes.md) | Memory Is Recalled by Meaning, in Three Scopes | Accepted |
| [ADR-0123](adr-0123-a-places-knowledge-reaches-the-lead-only-as-an-excerpt.md) | A Place's Knowledge Reaches the Lead Only as an Excerpt, Never Indexed in hq | Accepted |
| [ADR-0124](adr-0124-a-long-conversation-is-compacted-into-segments-written-once.md) | A Long Conversation Is Compacted Into Segments Written Once, With a Ledger | Accepted |
| [ADR-0125](adr-0125-voice-is-a-mode-of-the-conversation.md) | Voice Is a Mode of the Conversation | Accepted |
| [ADR-0125-s-1](adr-0125-voice-is-a-mode-of-the-conversation.md#decision) | ↳ Speech providers are organisation settings, outside the model policy (its Decision, last sentence) | Superseded by adr-0139 |
| [ADR-0126](adr-0126-a-tools-kind-decides-whether-it-runs-in-the-foreground.md) | A Tool's Kind Decides Whether It Runs in the Foreground or the Background | Accepted |
| [ADR-0127](adr-0127-a-conversations-home-decides-who-may-speak-and-who-pays.md) | A Conversation's Home Decides Who May Speak in It and Who Pays | Accepted |
| [ADR-0127-s-1](adr-0127-a-conversations-home-decides-who-may-speak-and-who-pays.md#decision) | ↳ Who pays: the key order of project, person and organisation (its Decision) | Superseded by adr-0141 |
| [ADR-0128](adr-0128-the-open-conversation-is-docked-and-navigation-never-closes-it.md) | The Open Conversation Is Docked, and Navigation Never Closes It | Accepted |
| [ADR-0129](adr-0129-a-places-sections-are-navigated-in-the-left-panel.md) | A Place's Sections Are Navigated in the Left Panel | Accepted |
| [ADR-0130](adr-0130-cloud-features-are-gated-by-their-own-conditions.md) | Cloud Features Are Gated by Their Own Conditions | Accepted |
| [ADR-0131](adr-0131-a-machine-may-pull-private-images-with-registry-credentials.md) | A Machine May Pull Private Images With Registry Credentials | Accepted |
| [ADR-0132](adr-0132-cloud-may-turn-remote-access-on-for-a-machine-it-runs.md) | Cloud May Turn Remote Access On for a Machine It Runs | Accepted |
| [ADR-0133](adr-0133-cloud-may-ask-for-admin-links-on-a-machine-it-runs.md) | Cloud May Ask for Admin Links on a Machine It Runs | Accepted |
| [ADR-0134](adr-0134-an-hq-connects-to-cloud-by-device-approval-and-signed-tokens.md) | An hq Connects to Cloud by Device Approval and Signed Tokens | Accepted |
| [ADR-0134-s-1](adr-0134-an-hq-connects-to-cloud-by-device-approval-and-signed-tokens.md#decision) | ↳ Only a fleet admin who is also an organisation admin connects, in the Fleet Console (its Decision, last bullet) | Superseded by adr-0144 |
| [ADR-0135](adr-0135-cloud-connects-an-hq-it-runs-without-a-code.md) | Cloud Connects an hq It Runs Without a Code | Accepted |
| [ADR-0136](adr-0136-every-connection-restarts-at-1-0-and-peers-one-major-apart-still-talk.md) | Every Connection Restarts at 1.0, and Peers One Major Apart Still Talk | Accepted |
| [ADR-0137](adr-0137-a-release-is-cut-on-its-own-release-branch.md) | A Release Is Cut on Its Own Release Branch | Superseded by adr-0146 |
| [ADR-0138](adr-0138-providers-are-held-by-hq-and-written-by-three-named-actors.md) | Providers Are Held by HQ and Written by Three Named Actors | Accepted |
| [ADR-0139](adr-0139-one-resolver-chooses-every-model-and-voice-call.md) | One Resolver Chooses Every Model and Voice Call | Accepted |
| [ADR-0140](adr-0140-setup-needs-models-and-voice-before-the-organisation.md) | Setup Needs Models and Voice Before the Organisation | Accepted |
| [ADR-0141](adr-0141-every-call-is-costed-to-a-billing-profile-in-an-append-only-ledger.md) | Every Call Is Costed to a Billing Profile in an Append-Only Ledger | Accepted |
| [ADR-0142](adr-0142-the-organisations-admin-area-is-separate-from-its-page.md) | The Organisation's Admin Area Is Separate From Its Page | Accepted |
| [ADR-0143](adr-0143-hqs-cloud-key-rolls-over-without-approval.md) | hq's Cloud Key Rolls Over Without Approval | Accepted |
| [ADR-0144](adr-0144-agenthix-cloud-is-connected-from-hq-by-an-organisation-admin.md) | Agenthix Cloud Is Connected From HQ by an Organisation Admin | Accepted |
| [ADR-0145](adr-0145-an-installation-owns-its-published-ports-and-address-blocks.md) | An Installation Owns Its Published Ports and Address Blocks | Accepted |
| [ADR-0146](adr-0146-a-release-is-a-proven-build-given-a-name.md) | A Release Is a Proven Build Given a Name | Accepted |
| [ADR-0147](adr-0147-a-secret-is-used-only-by-a-workflow-a-person-approved-run-by-the-platform.md) | A Secret Is Used Only by a Workflow a Person Approved, Run by the Platform | Accepted |
| [ADR-0148](adr-0148-an-agent-runs-approved-workflows-and-reads-their-masked-output.md) | An Agent Runs Approved Workflows and Reads Their Masked Output | Accepted |
