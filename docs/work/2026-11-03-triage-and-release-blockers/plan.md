# Triage and release blockers — plan

Every open Bug, Debt and Chore checked against the code, every release blocker closed, and the platform's
first QA audit run, before the early access release 0.1.0.

## Approach

- **Discovery first (done).** One agent per code area triaged that area's open items and audited its code for
  security and critical problems, read-only. The QA domain maps under `docs/qa/domains/` were drawn or extended for it.
  The audit only reported; its fixes go to this plan's lanes. Its regression pass is not run now: the full regression
  runs once, at the close.
- **The cut.** The owner decided the triage in groups: what is already done is closed with its evidence; Security and
  Critical items are fixed in this unit whatever their effort; easy Non-critical items are re-assessed once those are
  done; the rest stay in the backlog.
- **Fixes in lanes**, one agent per lane, each lane one feature. Lanes that share code run one after the other. Each
  lane lands on the unit's branch as **one commit**, rebased onto the branch's head and fast-forwarded, its message
  listing every fix in it. The lead runs the tests for what each lane changed before it lands, including the
  integration, cross-application and container suites where the lane changed what they test.
- **A finding fixed in this unit gets no issue**; this plan and its commits are its record. Existing issues are closed
  with their evidence as they are fixed. What is still open at the close is raised as issues then.

## Phases

### 1. Security and critical fixes

Thirteen lanes:

| Lane | Area |
|---|---|
| L1 | The tool gate and approvals |
| L2 | Run isolation in agent containers |
| L3 | The site's file reads in agents' folders, and subscription sign-in |
| L4 | The site's git operations |
| L5 | Conversation access in HQ, and deleting a task's conversation with it |
| L6 | What the lead works with in a turn: places, knowledge and memory |
| L7 | Input handling on the site and fleet channels, and pattern matching |
| L8 | Signing in |
| L9 | The Library and skills: installing, saving, publishing, removing, switching off |
| L10 | The host service's failure paths: restore, move, erase and upgrade |
| L11 | First install: installing as root, the Fleet Console on Docker Desktop, the workflow image, agents' network rules |
| L12 | Smaller separate fixes in HQ: agents' text, routines, the support bundle, voice previews |
| L13 | Documents: installing from source, and wording for a public repository |

Order: L2 before L1 and L3 (the site's agent runtime); L5 before L6 (HQ's conversation code); L10 before L11 (the host
service's install and upgrade code). The other lanes run beside them.

### 2. Easy wins, re-assessed

Once phase 1 is done, the owner re-assesses the easy Non-critical bugs and the easy Debt and Chores.

### 3. Design pass

The whole platform's user experience, made tight with the owner: its own plan, `design-plan.md`. It starts once phase
2 is done, so fixes have stopped moving screens around. Done for the areas the release needs: the chat panel and the
conversation, the workspace view, the skills screens, projects, tasks and boards, Runs, and (as its own unit) the tasks,
runs, boards and routines model. Seven areas wait until after the release: setting up a new HQ, onboarding a member,
agents and their permissions, places and files, workflows and GitHub set-up, settings, and the Fleet Console.

### 4. Release blockers

Everything that must be true before 0.1.0, and nothing else. Built and landed on the unit's branch in lanes:

- **One model for a conversation.** The model a person picks in a conversation applies to the lead and to the work it
  hands off, falling back to the next allowed model where one may not be used; an agent and the organisation each keep
  one default model instead of a conversation default and a worker default. A task keeps its own editable model, and a
  conversation's model is only the default for a task it creates.
- **Who may send into a task's session**, checked on the server, including a task whose own task was deleted, and voice
  ending when its holder may no longer speak.
- **Approvals:** a run waiting for approval keeps its own task where it is and states no result, and an approval card
  says why a run asks, never its result (site protocol 1.16).
- **Plain run failures, the merge link and a waiting merge request, and the task workspace hint.**
- **The public rules and the changelog:** feature requests, triage, security reporting, conduct, the pull request
  template, the guide page rename.

The blockers that need a real machine are phase 5's. Items whose fix is too large for 0.1.0 are held for the next release.

### 5. Proofs on real machines

The release is cut from the finished branch, after the short voice unit that follows this branch's merge, and then proved on
the VPS test environment: the release rehearsal and the release build run on `main`, and the release is tagged
`v0.1.0-alpha.4` (the next pre-release). That build is installed on the VPS, and these are proved: the Linux host and
model relay, the executor's controls on Docker Engine, two machines together, attachments, avatars and MCP tools on the
current Wasp, and the skills model checks on the baseline model. The host service's upgrade end to end (#31) is proved
last, by installing the previous pre-release and switching to the newest.

The owner then uses it with real projects for about a week. What that finds is fixed on `main` and goes out as further
pre-releases; a fix may be built on the VPS itself for a quick loop between them.

### 6. Readiness check

After the live test. Ready to go public: the licence, no open public issue or committed text naming a private place,
and Private vulnerability reporting switched on.

Settled in phase 4 (owner, 8 Nov): feature requests go to Discussions (Ideas), never to issues; no response or
acknowledgement promises anywhere; a private security report is requested, not required; at the moment the repository
goes public, turn on Private vulnerability reporting (it is not offered while the repository is private).

### 7. Close

After the live test. The full regression; the QA audit's contract changes; closing the triaged issues; raising what is
left open. A stocktake of what the unit defers, and a second triage of it, plan what follows the release.

## Deviations

- **The QA audit ran at the unit's start, report-only.** Its usual action phase is replaced by phase 1's lanes, and its
  regression pass by the full regression at the close (owner, 2026-11-03).
- **Findings fixed in the unit get no issue** (owner, 2026-11-04), in place of the triage design's rule that every new
  Security or Critical finding becomes an issue after the cut.
- **Lanes land as one squashed commit each**, not a merge commit (owner, 2026-11-04).
- **The phases were reordered** (owner, 2026-11-04): easy wins, then the design pass, then a review of the hard items
  with the owner (after the design pass, which may change their shape), then the proofs on real machines, then the
  readiness check (was *Before public*), then the close. The proofs were phase 2; moved so the VPS set-up holds
  nothing up.
- **One model for a conversation moved from the design pass to phase 4** (owner, 2026-11-05): it is a change to how
  models are resolved, not to the screens.
- **The design pass ends after area 4** (owner, 2026-11-07). Areas 1, 3, 5, 6, 9, 10 and 11 are deferred past 0.1.0.
- **Tasks, runs, boards and routines move to a unit of their own** (owner, 2026-11-07): the design pass found that the
  task model itself needs changing (task types with their own columns, boards as saved views, nothing starting work but
  an explicit act, routines as repeatable runs). That is architecture, and a release blocker, so it is planned and built
  as its own unit. Area 4c (boards and the timeline) and the Runs pass go with it.
- **Every build that changes a screen gets a design check** (owner, 2026-11-07): an independent reviewer checks it
  against `ui/DESIGN-SYSTEM.md` and sends it back, for at most three rounds, before the owner sees it.
- **The unit is paused and merged to `main` after area 4b** (owner, 2026-11-07), with the full regression run first.
- **The review of the hard items moves to after the release** (owner, 8 Nov): the 302 hard items stay open and are
  triaged again with the stocktake of everything this unit defers; the 8 quick wins deferred for a decision go with them.
- **The design pass closes with five areas done** (owner, 8 Nov): areas 1, 3, 5, 6, 9, 10 and 11 are deferred past 0.1.0.
- **Phase 4 became "Release blockers"** (owner, 8 Nov), and the proofs on real machines were separated from them.
- **Some release-flagged items move to the next release** (owner, 8 Nov), where their fix is larger than 0.1.0 can carry.
- **The release is cut before the live test** (owner, 8 Nov): the branch is merged and `v0.1.0-alpha.4` is tagged, so a
  Linux or amd64 problem shows while there is a week to fix it; patches follow as further pre-releases.
- **The unit stays open as the release unit** (owner, 8 Nov) while its branch is merged: phases 5 to 7 follow the live
  test and close it.
- **A short voice unit runs between this branch's merge and the release** (owner, 8 Nov): hearing from a second provider
  so voice needs one key, and a short model call that reads the conversation in place of repeated stored phrases. It
  merges to `main` before the release is cut; this unit resumes at phase 5 after it.
