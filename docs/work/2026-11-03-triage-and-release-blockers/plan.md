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

### 2. Proofs on real machines

The release blockers that need a run on a real machine, on the VPS test environment and the dev machine: the Linux
host and model relay, the executor's controls on Docker Engine, the host service's upgrade end to end (after it learns
to offer pre-release versions), two machines together, attachments and MCP tools on the current Wasp, and the skills
model checks on the baseline model.

### 3. Easy wins, re-assessed

Once phase 1 is done, the owner re-assesses the easy Non-critical bugs and the easy Debt and Chores.

### 4. Before public

The process for feature requests and moderation, the guide page rename, the changelog, the licence, and no open public
issue naming a private place.

### 5. Close

The full regression; the QA audit's contract changes; closing the triaged issues; raising what is left open.

## Deviations

- **The QA audit ran at the unit's start, report-only.** Its usual action phase is replaced by phase 1's lanes, and its
  regression pass by the full regression at the close (owner, 2026-11-03).
- **Findings fixed in the unit get no issue** (owner, 2026-11-04), in place of the triage design's rule that every new
  Security or Critical finding becomes an issue after the cut.
- **Lanes land as one squashed commit each**, not a merge commit (owner, 2026-11-04).
