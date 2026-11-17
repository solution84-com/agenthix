---
created: 2026-10-24
description: How workflows are built — the proofs and contracts first, then the executor on the site and the library in hq side by side, then GitHub through workflows, the screens, the security suite and the documents — in seven phases carried out by lanes, as automated as the work allows.
---

# Implementation Plan · Workflows

## Goal

No secret value ever enters an agent's container: every secret is used only by an approved workflow, run by the
executor in containers of its own, and git and GitHub go through workflows, with several GitHub accounts per
organisation.

**In scope:** the six parts of the [spec](spec.md):
- **The library** (part 1): workflows, versions and their hash, parameters, On/Off, the plain checks, the reviewer,
  approval, the agent's four tools, rerun limits.
- **Running** (part 2): the executor image, executor containers, the snapshot and the approved files, the egress proxy,
  step events, masking, the changed-file scan, write-back, and the agent container's hardening.
- **Secrets and variables** (part 3): the store, the two kinds, rotation, revoking, the record of use.
- **GitHub** (part 4): the mint gate, the public App and its ceiling, several GitHub accounts, which places can connect,
  the connect flow, the starter workflows, environment secrets; removing the credential helper, the site's credential
  endpoint and hq's credential operation.
- **Screens** (part 5), the security suite (part 6), adr-0147 and adr-0148, the documents, the user
  guide and the QA contract.

**Out of scope:**
- **Other integrations** (Slack, databases, clouds). Each is secrets plus workflows; the mechanism is built here, and
  each integration is its own work after it.
- **Limiting the agent's own outbound network.** The spec leaves it unchanged: there is no secret left to send. A
  separate decision.
- **Triggers on a schedule or a push.** Automation already starts agents on a schedule, and an agent can run a workflow.
- **A feature flag.** The credential helper's removal can't sit behind a flag — git either goes through workflows or it
  doesn't — so the unit lands whole (ADR-0116 allows a feature that ships ready).

## Approach

**Prove the assumptions first.** The design rests on seven facts about Docker, GitHub and our own parts (spec part 6,
V1–V7). Three of them — DNS on an internal network, token narrowing and revoking, environment secrets on protected
branches — would change the design if they were wrong, and each can be tested in an afternoon. So phase 1 runs them
as throwaway experiments before anything is built, beside the contracts. The rest are proved by the lanes that build
what they concern.

**Contracts first, then two sides at once.** Phase 1 commits the shared types in `core` — the workflow definition, the
run instruction, step events and results, the agent's four tools' schemas — and every new table in both schemas. The
site's executor (phase 2) and hq's library (phase 3) then build against them in parallel, because they meet only at
the run instruction and step events. GitHub (phase 4) needs both: its starter workflows run on the executor and its
mint gate sits in the library's run path.

**One module per authority**, as the last unit did. Every installation token goes through `github/mintGate.ts`; every
secret write and read through `secrets/store.ts`; every approval through `workflows/approve.ts`; every run through
`workflows/runs.ts` on hq and `executor/run.ts` on the site. Each module enforces its part's rules and is tested there,
so a lane that needs a token, a secret or an approval calls the module, never the table.

**Removal with the replacement.** The credential helper, the site's credential endpoint, `resolve_git_credential`,
`getTokenFor`'s cache and the direct GitHub-secret box are removed in the lanes that put the workflow path in their
place, in the same change, so the build never has two ways to reach a token. Before the first release candidate the
repository is a clean slate: old rows and `RepoAttachment`s without GitHub ids are dropped, never converted.

**The security suite is built from the spike's harness.** The scratch harness from the dropped spike already plants
canaries and scans for them (`new-canaries.sh`, `scan-leaks.sh`) and has a sink that records anything sent out. Phase 6
writes the committed suite fresh from that shape — one test per attack A1–A18 — against the real site and executor.
Lanes in phases 2–4 add the attack tests for what they build as they go; phase 6 completes the matrix and runs it end
to end.

### How the work is automated

The owner's aim is the least manual load. The lead runs the unit end to end and stops only for the hard stops below.

- **Lanes, in the background:** every phase runs as lanes under the lead, each with its own branch
  and worktree, a brief of a few lines (the tasks by number, the spec section that is its acceptance, the files it
  owns), and the shared rules in `execution/lane-common.md`. Lanes write their report to `execution/reports/` and post
  one line.
- **Models per lane:** Opus for the security-bearing lanes (the executor's launcher, snapshot and scan; the proxy; the
  mint gate; the secret store; approvals and the plain checks; the security suite). Sonnet for bounded lanes (screens,
  documents, the image, the tools' wiring). Haiku is not used: every lane here touches a security boundary or a screen.
- **Tests:** lanes run the typecheck and unit tests for what they touched, through the machine-wide lock wrapper
  (`VITEST_MAX_WORKERS=1`, a capped heap). They never run integration, cross-app, container or e2e suites — those use
  fixed ports and the shared test databases — so the lead runs them after the lanes that change what they test. The
  full regression runs once, at the close: this unit adds an image part and changes Dockerfiles, a core protocol and
  both schemas, so it is the full regression with the image start test and the install test.
- **Container tests:** the executor's own tests start real containers. They run under the lock, one at a time, with
  `--memory 2g --cpus 2`, by the lead after the lane, and the lead removes leftover containers and networks by label
  after each run.
- **Merging:** lanes merge into the unit's branch one at a time, in the order each phase lists, rebased onto its head
  and squashed to one commit (or a few ordered ones), with the tests for what changed run again. The lead generates
  every migration at merge; lanes never write one.
- **Resources:** at most three building lanes at once (24 GB, 10 cores, disk tight), every heavy command through the
  lock, and the lead watching free memory, swap, load and disk with alerts and recovery notices, as in the last unit.
  At a limit, the newest lane pauses first; screens and documents lanes yield to security lanes.
- **The owner's walkthrough** comes after phase 5, on a real hq and site with the test GitHub organisations: register
  the App, allow two accounts and a client by install link, connect a new and an existing repository, approve the
  starters, push, pull and open a pull request through workflows, add a secret with *Also set it on GitHub*, run a
  deploy-like workflow, turn off what uses a secret. It is the unit's feedback loop; its fixes are small lanes.
- **Landing:** the branch merges to `main` once, at the close, after the full regression, only on the owner's say-so.
  Nothing is pushed without it.

### Assumptions, decisions and what reaches the owner

The lead and the lanes decide what the spec and the code make obvious, and record every assumption in one place: the
handover's numbered **Assumptions** list, each with what was assumed, why, and what changes if it's wrong. A security
threat with one obvious fix is closed and reported. What takes the design somewhere new, or is high risk with no
obvious path, goes under **Deviations** below and stops for the owner.

**The owner hears at these points, and otherwise not:**
1. **When phase 1 ends** — the proofs' results (any failure is a design change and stops the unit), and the
   assumptions so far.
2. **When phases 2–4 have merged** — the assumptions they added, before screens are built on them.
3. **At the walkthrough** — the walkthrough itself, with the list.
4. **At the close** — the remaining list, the follow-ups, and the merge question.
5. **At once, whenever it happens:** a security or legal blocker, something only the owner can do, a push or merge, or
   a destructive database or storage step.

**Assumptions made in writing this plan,** for the first report:

| # | Assumption | Why | If wrong |
|---|---|---|---|
| 1 | An executor image upgrade keeps each approval when the image's tools stage is unchanged, and otherwise asks for approval again while the old image keeps running (spec part 1, *Image upgrades*) | The image digest is in every hash; without this, every release would leave every workflow waiting | A release asks every place to re-approve every workflow |
| 2 | `run_workflow` waits for the run and answers with its results; `workflow_run(id)` lets the agent check a run it stopped waiting for | Runs can take up to the time limit, longer than a tool call should hold | One tool, with the agent polling |
| 3 | Viewers can see workflows and runs but not press Run (ADR-0102) | Running a workflow acts with the place's secrets | Viewers can run approved workflows |
| 4 | A conflict on write-back keeps the run's file beside the agent's as `<file>.workflow-<run>` | The spec says *keeps its own copy beside it* without a name | A different name |
| 5 | Deleting a secret or variable an approved version names is refused while that workflow is on | Otherwise a run fails later on a missing value | Deleting turns those workflows off |
| 6 | `push-bundle` is a script in the executor image | Keeps each starter step one line; the image is released and signed | The starters carry the clean-repository commands inline |
| 7 | The approval card reuses the conversation's existing `APPROVAL_REQUEST` and `APPROVAL_ANSWER`, the answer naming the version's hash | It already carries approvals; the hash ties an answer to what was shown | A new message kind |
| 8 | Agenthix's starting App permissions are today's list (contents, pull requests, secrets, workflows, administration: write; metadata: read) plus `actions: write`, for `gh workflow run` | The ceiling must cover the starters and starting a GitHub workflow | The organisation adds it on GitHub |

### What only the owner can do

- **Test GitHub organisations.** Proving V2 and V7 and the walkthrough need a real App on at least two GitHub
  organisations the owner controls (one standing in for a client) and a personal account. Creating a GitHub
  organisation and approving an App's installation are done by a person on GitHub. Needed before phase 1's GitHub proofs;
  the lead asks for them the day the unit opens.
- **Every commit of a document**, and any change to adr-0147 or adr-0148 before the merge.
- **The walkthrough**, each push, and the merge.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0042 (hq is the organisation's own), ADR-0060 (authority comes from the boundary), ADR-0066 (a site reaches its agents over a private network per boundary), ADR-0095 and ADR-0101 (a run is on behalf of, and bounded by, the person it is for), ADR-0102 (viewer is a project role), ADR-0106 (each service keeps its own logs, secrets removed), ADR-0117 (a host service runs only signed, published images). All are Accepted |
| **Implements** | adr-0147 (a secret is used only by a workflow a person approved, run by the platform) and adr-0148 (an agent runs approved workflows and reads their masked output), both recorded on the unit's branch when it opened, and reaching `main` with it |
| **Revisits** | adr-0037 (connectors, environments and approved workflows): sections 3, 4 and 8 superseded by adr-0147, sections 6 and 7 by adr-0148, flagged in place on the branch. ADR-0085 (a harness's file tools where it can be a confused deputy): check it still holds with the credential helper gone |

## Key decisions

| Decision | Why |
|---|---|
| Phase 1 proves V1, V2 and V7 before anything is built | Each one failing changes the design (the proxy's DNS, the token's narrowing, how secrets reach GitHub Actions), and each is cheap to test |
| The executor and the library are built in parallel | They meet only at the run instruction and step events, fixed in phase 1's contracts; building them in sequence would double the unit's length for no safety |
| Not: GitHub first, as the user-visible part | The starter workflows need the executor and the library to exist; GitHub built first would be built on the credential helper the unit removes |
| One module per authority (mint gate, secret store, approvals, runs) | The security rules live in one place each, tested there; a lane can't bypass one by writing to the table |
| The credential helper and endpoint go in the lane that adds `push` and `pull` | Removing them first breaks git for every agent; removing them later leaves the token path open while the new one exists |
| The security suite is written fresh, shaped by the spike's harness | Scratch scripts are never committed; the harness's shape (canaries, a sink, a scan) is what made the baseline attacks reproducible |
| Not: a feature flag for workflows | The old git path can't stay beside the new one without leaving the token in the container |
| No execution plans | No phase's steps are themselves the risk: the riskiest mechanisms (snapshot, scan, mint gate) are specified to the mechanism in the spec, and lanes derive the steps from it. Phase 6 is a discovery phase in part, which can never have one |
| Opus for security-bearing lanes, Sonnet for the rest | The cost of a wrong security mechanism is far higher than the model's; screens and documents are bounded |

## Work breakdown

Seven phases. The seams:
1. The proofs and contracts everything rests on.
2. and 3. The two sides that meet at those contracts, built at once.
4. GitHub, which needs both.
5. The screens, on the finished operations.
6. The security suite end to end, and the walkthrough.
7. The documents, written against the code.

### Phase 1 — Proofs and contracts
**Delivers:** V1, V2, V5 and V7 answered (throwaway experiments, results in the handover); every shared type in `core`;
every new table and column in both schemas, with migrations, committed on the unit's branch.
**Starts when:** the unit's branch is cut and the test GitHub organisations exist (for 1.2 and 1.4 only).
**Execution plan:** none — lanes. 1a, proofs (Opus); 1b, contracts and schemas (Opus). The lead generates the
migrations.

- [x] 1.1 V1: an internal Docker network with `--dns` at a proxy resolves nothing through Docker's own resolver
- [x] 1.2 V2: an installation token with `permissions` and `repository_ids` gets exactly those; `contents: write` can't change `.github/workflows/`; revoking ends it at once
- [x] 1.3 V5: `gh pr create` takes the title and body from files or one quoted argument
- [x] 1.4 V7: an environment secret on protected branches isn't given to GitHub workflows on other branches or pull requests
- [x] 1.5 `core`: the workflow definition's type and parser rules (fields, names, parameters, hosts, GitHub permissions, limits)
- [x] 1.6 `core`: the version hash — the one encoding and what it covers — with its test vectors
- [x] 1.7 `core`: the run instruction, step events, the run result, stop, and the site protocol's minor version raised
- [x] 1.8 `core`: the four agent tools' schemas (`list_workflows`, `propose_workflow`, `run_workflow`, `workflow_run`)
- [x] 1.9 hq schema: `Workflow`, `WorkflowVersion`, `WorkflowApproval`, `WorkflowRun`, `WorkflowStepRun`, `PlaceSecret`, `PlaceVariable` with its history, the record of secret use
- [x] 1.10 hq schema: GitHub installations allowed or not, which places can connect, a project's default account
- [x] 1.11 site schema: a repository connection's installation id, repository id and account; executor runs and their snapshots

### Phase 2 — The executor, on the site
**Delivers:** a site that receives a run instruction and carries it out step by step in executor containers, with the
snapshot, the approved files, the egress proxy, masking, the changed-file scan and write-back, reporting step events;
the executor image built and started; the agent container hardened.
**Starts when:** phase 1 is merged.
**Execution plan:** none — lanes. 2a, the image (Sonnet); 2b, the launcher, snapshot, write-back and stop (Opus); 2c,
the egress proxy (Opus); 2d, masking and the scan (Opus). 2a first; 2b, 2c and 2d in parallel after it. Merge order 2a,
2b, 2d, 2c.

- [x] 2.1 `site/docker/executor.Dockerfile` sharing the agent image's tools stage, with `gh` and `push-bundle`; the `executor` image part in `scripts/images/parts.json`; `EXECUTOR_IMAGE`
- [x] 2.2 V4: the executor image has no credential helper; its start test
- [x] 2.3 Receiving a run instruction over the control channel and rechecking the hash
- [x] 2.4 `/run/workflow` read-only from the received files, and `/run/out` per run
- [x] 2.5 The workspace snapshot (copy-on-write where the disk allows), never following links, per run (V6)
- [x] 2.6 Starting each step's container with the settings in spec part 2, its own secrets and parameters on a tmpfs, the variables, the limits
- [x] 2.7 Step order, the first failure ending the run, step and run timeouts, Stop
- [x] 2.8 Step events with masked output so far, to hq over the control channel
- [x] 2.9 The egress proxy: per-run networks, the allow-list, its own name resolution, refusing private addresses, answering DNS
- [x] 2.10 Masking: every secret of the place in every form, base64 at three alignments, held-back chunks, file secrets by line
- [x] 2.11 The changed-file scan by content, git's new objects decompressed, and `/run/out`
- [x] 2.12 Writing back as a change set, with conflicts kept beside, only when the scan passes
- [x] 2.13 Leftover containers, networks and snapshots removed after a run and when the site starts
- [x] 2.14 The agent container's hardening: `--cap-drop ALL`, `no-new-privileges`, a read-only root with its writable folders
- [x] 2.15 V3: no site endpoint the agent's run token can call returns a run instruction, unmasked output or a secret
- [x] 2.16 Attack tests for what the site stops: A3, A5, A6, A7, A8, A13 (snapshot), A18

### Phase 3 — The library, secrets and variables, in hq
**Delivers:** hq keeps secrets and variables, takes proposals, reviews them with the plain checks and the reviewer,
records approvals, and starts runs on the site — with the agent's four tools served through the site's MCP server.
**Starts when:** phase 1 is merged. Runs alongside phase 2.
**Execution plan:** none — lanes. 3a, the secret and variable store (Opus); 3b, the library, versions, approvals and
On/Off (Opus); 3c, the plain checks and the reviewer (Opus); 3d, runs and the agent's tools (Sonnet). 3a and 3b first,
then 3c and 3d. Merge order 3a, 3b, 3c, 3d.

- [x] 3.1 `secrets/store.ts`: write, replace, delete, never read back to a page, decrypt only for a run; associated data; file secrets as bytes
- [x] 3.2 Variables with their history, refused names, and the *looks like a secret* check
- [x] 3.3 Rotate-by dates and the notification a week before; overdue
- [x] 3.4 *Turn off what uses it*, and the record of every use
- [x] 3.5 Proposals: reading the definition and its files from the workspace through the site, links refused; the hash
- [x] 3.6 `workflows/approve.ts`: who approves in a project and in a person's own storage, the own-storage GitHub permission limit, approvals per workflow, place and hash
- [x] 3.7 On/Off, who may switch it, and stopping a run in progress
- [x] 3.8 The plain checks R1, the card's summary from the diff, and the card rule
- [x] 3.9 The reviewer R2: no tools, the organisation's default model, its level and points
- [x] 3.10 The approval card through `APPROVAL_REQUEST` and `APPROVAL_ANSWER`, the answer naming the hash
- [x] 3.11 `workflows/runs.ts`: the checks before a run, minting integration values, the run instruction, step events, the result, revoking minted tokens
- [x] 3.12 Agent rerun limits, and who may press Run
- [x] 3.13 The agent's four tools, forwarded from the site's MCP server to hq
- [x] 3.14 Executor image upgrades: keeping or asking for approval again, and the site keeping an image still named
- [x] 3.15 Attack tests for what hq stops: A1 (flags), A9, A10, A11, A14

### Phase 4 — GitHub through workflows
**Delivers:** every installation token through the mint gate; the App public with its ceiling; several GitHub accounts,
allowed, with which places can connect; the connect flow with its checks; the four starter workflows; the credential
helper, endpoint and operation gone.
**Starts when:** phases 2 and 3 are merged.
**Execution plan:** none — lanes. 4a, the mint gate and removals (Opus); 4b, the App, accounts and connect rule (Sonnet);
4c, the connect flow (Sonnet); 4d, the starter workflows (Opus). 4a first; then 4b and 4c; 4d after 4a. Merge order 4a,
4b, 4c, 4d.

- [x] 4.1 `github/mintGate.ts`: repository from the workspace by id, the place and connect rule, GitHub ids, no agent exception, declared permissions and `repository_ids`, never cached, revoked at a run's end
- [x] 4.2 Every existing token path moved onto the gate (connecting, repository work, GitHub runs and secrets listings); `getTokenFor`'s cache removed
- [x] 4.3 Remove `agenthix-git-credential` from the agent image, the site's git credential endpoint and `resolve_git_credential`; a plain `git push` names the `push` workflow
- [x] 4.4 The manifest: public, Agenthix's starting permissions with `actions: write`
- [x] 4.5 Reading the App's real permissions and each account's accepted ones from GitHub; checking proposals against them, with how to fix
- [x] 4.6 Installations: *wants to connect*, allow and ignore, polling after GitHub's redirect instead of Refresh
- [x] 4.7 Which places can connect: every project or chosen ones, people's own storage none by default; enforced on connect and at the gate
- [x] 4.8 A project's default account, and a workspace's choice of another
- [x] 4.9 Install links for a client, with the note
- [x] 4.10 The connect flow: new or existing, checks before creating, the selected-repositories fix, cleanup on a later failure, existing into a location with files
- [x] 4.11 Proposing the starter workflows when a repository is connected
- [x] 4.12 `push`, `pull` and `open-pull-request`, with `push-bundle` and the clean repository; protected branches refused
- [x] 4.13 `set-github-secrets` with environment secrets on protected branches; *Also set it on GitHub* proposing it
- [x] 4.14 Remove the direct *Add a secret (sent to GitHub)* box's operation; GitHub secrets listed by name, *Outside hq* where not from Secrets
- [x] 4.15 Attack tests: A12, A13 (git), A15, A16, A17

### Phase 5 — Screens
**Delivers:** every screen in spec part 5, on desktop and phone, with e2e tests.
**Starts when:** phase 4 is merged.
**Execution plan:** none — lanes. 5a, Workflows, a workflow, approving and a run (Sonnet); 5b, Secrets and variables
(Sonnet); 5c, the GitHub page, a project's GitHub section, connecting and a connected workspace (Sonnet). All three in
parallel; merge order 5a, 5b, 5c.

- [x] 5.1 The project panel's Workflows and Secrets and variables entries, with *N need you*; the same in a person's own space
- [x] 5.2 The Workflows section (U2), with the switch and Run
- [x] 5.3 A workflow's page (U3): Steps, Versions, Runs, the Run dialog
- [x] 5.4 The approval card and the full review (U4)
- [x] 5.5 A run's page and its card in the conversation (U5)
- [x] 5.6 Secrets and variables (U6): both tabs, add a secret, history, turn off what uses it
- [x] 5.7 The GitHub page in the admin area (G1), Infrastructure's card becoming a link
- [x] 5.8 A project's GitHub section, and `/projects/:key/github` opening it
- [x] 5.9 The connect flow (G2) from a workspace, Files and a new workspace
- [x] 5.10 A connected workspace's About (G3); the old box and the Operations panel's adding removed
- [x] 5.11 e2e specs for each screen

### Phase 6 — The security suite, and the walkthrough
**Delivers:** the attack matrix A1–A18 complete and passing end to end, with canaries, against a real site, executor and
test GitHub organisations; the owner's walkthrough and its fixes.
**Starts when:** phase 5 is merged.
**Execution plan:** none — lanes, and the walkthrough is a discovery loop, which never has one. 6a, the suite (Opus); fix
lanes as the walkthrough finds them.

- [x] 6.1 The suite's harness: canaries in every secret kind, a sink for anything sent out, a scan of everything the agent can read
- [x] 6.2 The attacks the phases didn't cover, and every attack run end to end in one pass
- [x] 6.3 The baseline attacks from the spike (a token from git's credential helper, sending it out) failing against the new build
- [x] 6.4 The walkthrough on a real hq and site with the test GitHub organisations
- [x] 6.5 The walkthrough's fixes

### Phase 7 — Documents
**Delivers:** adr-0147 and adr-0148 true to what was built, and every document describing the present.
**Starts when:** phase 6's walkthrough has passed.
**Execution plan:** none — lanes. 7a, architecture and concepts (Opus); 7b, the user guide (Sonnet).

- [x] 7.1 adr-0147 and adr-0148 checked against what was built (corrected on the branch if a decision changed); ADR-0085 checked
- [x] 7.2 Architecture: the executor, the run sequence, the proxy, the mint gate, in `docs/architecture/`
- [x] 7.3 Concepts: workflows, the executor beside the lead, worker and helper, secrets and variables, GitHub accounts
- [x] 7.4 The user guide: workflows, approving, secrets and variables, connecting GitHub, a client's GitHub organisation
- [x] 7.5 The QA contract: stories and scenarios, with the tests tagged
- [x] 7.6 `site/AGENTS.md` and `hq/AGENTS.md` where they describe git credentials or containers

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | None | — |
| 2 | Lanes 2e and 2g added: masking by form class and asynchronously (2e), then a 12-bit rolling tag on raw forms (2g) | 2d's masking ran at 0.06 MB/s and held the site's event loop for a second per chunk |
| 2–4 | Lane 2f added for 2.14, 2.15 and the executor image's tools-stage label | The approvals-across-upgrades rule needs a key per tools stage, which the image parts didn't carry |
| 3 | None beyond lane 2f's rows, which phase 3's approvals rely on | — |
| 4 | None beyond the rows marked 2–4 and 6 | — |
| 5 | 5a (and 5b) start before phase 4 ends | They need only phase 3's operations |
| 6 | The connect rule chooses people, covering their own storage and their personal projects; the Allow dialog splits Projects and People, each searchable | Walkthrough: personal projects could connect to no account, and the single list was confusing |
| 6 | `run_workflow` names the workspace it runs on, checked against the run's place | Walkthrough: no agent run is tied to a workspace (a run reaches every workspace of its boundary), so a run always fell back to the place's own files |
| 6 | `propose_workflow` names the workspace too, and its path is from the workspace's root | Walkthrough: a task's run has no workspace of its own, so a definition written in one was never found |
| 6 | The workflow tools are always offered to an agent's run, like the memory tools | Walkthrough: no tool list named them, so no agent was ever offered them |
| 6 | A private repository on GitHub's free plan counts as having no rulesets | Walkthrough: GitHub answers 403 for its rulesets, and the protected-branch check refused every push |
| 6 | open-pull-request also asks for contents: read | Walkthrough: `gh pr create` reads the default branch first |
| 6 | Connecting a repository to a location with history of its own keeps its branches, and pushes only its `main` | Walkthrough: it renamed the agent's branch to `main` and pushed it past the push workflow |
| 6 | A finished workflow run leaves the work bar for a card in the thread where it ended | Walkthrough: the bar kept a finished run for 30 minutes, spinning, then it vanished from the conversation |
| 6 | The `dispatchWorkflow` action, from before this unit, is removed | Found at the close: a second way to start a GitHub workflow from HQ, outside approved workflows |
| 6 | The *GitHub Operations* skill says how to write a workflow | Walkthrough: agents had no description of `workflow.yaml`, and wrote ones that got no secret |
| 6 | A twelfth plain check: a step with a secret writing to `/run/out`; *Approve all three* can't approve a first starter | Found at the close: the code had both; the spec is corrected to match |
| 6 | Deleting a project or erasing a person deletes its places' workflows; an agent's workflow tools work in the person's own storage for a task in their space; bundled agents and skills share work through the workflows | Found by the close's triage: each was broken behaviour the build had missed |
| 7 | None | — |

## Closing note

**Closed 2026-10-25. Accepted by the owner** after the walkthrough (parts A to E passed) and a review of the branch.

- **Regression:** the full regression passed — every module's typecheck, unit and integration suites, the cross-app
  suite, hq's browser tests, `npx wasp build`, every image built and start-tested, the install test, the guide's
  screenshots, and the site's, host's and starters' container suites. Known flaky tests seen and passing on a rerun:
  #22, #23, #58; the chat streaming browser test fails as #26 describes.
- **Open items:** the close triaged every item from the lane reports, the handover and the walkthrough against the code
  at head. Seventy-one were closed with evidence; four found critical at the close were fixed in the unit (workflows
  outliving their place, an agent's workflow tools in a person's space, bundled skills describing the removed
  credential helper, and the action that dispatched a GitHub workflow from HQ). Deferred as issues on this repository:
  #42, #44, #45, #46, #47, #48, #49, #50, #51, #52, #53, #54, #55, #56 and #57; none blocks a release. Eleven more —
  planned features, decisions for the owner and one check that must pass before 0.1.0 is released — are tracked
  outside this repository.
- **QA:** the unit wrote its contract (US-375 to US-382, SC-1276 to SC-1366) and tagged its tests. No QA audit ran at
  the close; these entries await the audit before release.
- **Decision records:** adr-0147 and adr-0148 carry implementation notes; adr-0066 notes that the git credential
  endpoint it named is gone; ADR-0085 still holds without the credential helper. Whether adr-0037 section 2 still
  stands beside adr-0147 is a decision left to the owner.
- **The plan is frozen** from here.

