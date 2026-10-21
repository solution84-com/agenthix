---
created: 2026-10-12
description: How the platform moves to a clean repository before it goes public — history scanned and secrets rotated, the tree swept of private references, one version, checks that pass on clean machines, then a new repository whose first commit is the tree, with the open issues recreated from cleaned text under their own numbers.
---

# Implementation Plan · A clean repository

## Goal

The platform lives in a repository whose whole history can be read by anyone without exposing a secret, an internal
note or a private place — so the team works there without worrying about what it leaks.

**In scope:** a secret scan of the whole history and the tree, and rotating what it finds; a sweep of the tree for
private references; one version, `0.1.0`, across every package; the pull-request checks, passing on GitHub's clean
machines; the new repository, with the tree as its first commit; the open issues recreated there from cleaned text,
keeping their numbers; the new repository's settings, including the contributor agreement's check.
**Out of scope:** making the repository public — decided outside this repository; the
first release tag — *Release ready*; anything a recreated issue asks for.

## Approach

**Prepare here, build the new repository beside it, then switch names.** Phase 1 runs on this unit's branch in the
current repository and changes only files: everything the new repository's first commit must hold is made true and
checked here, and the open issues are prepared as cleaned text. Phase 2 builds the new repository as
`agenthix-new` while the current one carries on untouched — issues, settings, then `main`'s tree as its first commit —
and the owner looks it over. Only then come two renames: the current repository to `agenthix-<date of the switch>`, as
earlier archives were, and `agenthix-new` to `agenthix`. Taking the name ends GitHub's redirect to the archive, which
is wanted. Until the switch, undoing is deleting `agenthix-new`; the archive is made read-only last, once the owner is
satisfied. Each step that renames, archives or is seen by anyone waits for the owner's approval on the day.

**The new repository stays private until launch.** From its first commit, everything committed to it is written as
public, which is the point: there is no earlier history to worry about.

**Issues are recreated, not moved, and keep their numbers.** A moved issue keeps the earlier versions of its edits, so
text cleaned by editing would stay one click away; an issue created from cleaned text has none. A new issue takes the
next free number, so the script creates them in number order into the empty repository: each open issue is created
under its own number, and every other number — a closed issue, a pull request, a deleted issue — is taken by a
placeholder that is then deleted. Every issue reference in the tree therefore stays true without a rewrite; a reference
to a closed issue leads to a deleted one, whose reasoning lives in the decision records, the epic and milestone records
and the units of work. Comments are folded into their issue's body with their dates; every issue and comment has the
same author, so no authorship is lost.

**Nothing private reaches the new repository's issues, checked in layers.** Each open issue is exported to the unit's
scratch folder and cleaned there: the known findings fixed, footers pointing at the old backlog dropped, links into the
old history or the archive made plain text, and uploaded files listed for the owner. A deny-list — the private
repository names in every spelling, internal record and backlog ids, private tooling, personal details, local paths,
addresses and hostnames — and gitleaks run over the cleaned set; a second agent, not the one that cleaned it, reads
every issue afresh; the owner reviews every change and approves the set, and the script refuses a file changed since.
The script runs the deny-list again before creating each issue and stops on a hit, and reads every issue back from
GitHub to check it once more. From the export to the switch, no issue is opened in the current repository. A final scan
of the tree and the issues runs before the repository goes public at launch.

**By the lead, with agents for the sweeps.** The secret scan, the reference sweep and the issue check are each one
agent's job, reporting to the unit's scratch folder, with the lead reviewing each finding. The hq test fixes are one
lane. The full regression runs before the branch merges; the branch lands on `main` by a `--no-ff` merge before phase
2, so the new repository's first commit is `main`'s tree. If `main` moves after that commit, it is replaced with the
latest tree before the switch.

## Decision records

| | Records |
|---|---|
| **Depends on** | None |
| **Implements** | None |
| **Revisits** | None |

## Key decisions

| Decision | Why |
|---|---|
| A new repository whose first commit is the tree | Rewriting history in place does not reliably remove what it held: forks, cached pull-request refs and old clones keep it |
| The current repository kept as `agenthix-<date>`, private and archived, as earlier archives were | Its history, closed issues and pull requests are the record of how the platform was built |
| Open issues recreated from cleaned text, not moved — owner, 2026-10-12 | A moved issue carries its edit history, so cleaning it by editing leaves the old text readable; GitHub offers no way to delete those versions by script |
| Every issue keeps its number; closed issues are not recreated — owner, 2026-10-12 | Created in order with placeholders for the gaps, no reference in the tree needs rewriting. Closed issues are finished work whose reasoning is in the records, and leaving them out leaves 98 old discussions out of the public repository |
| Squashing this repository and force-pushing it — **decided against** | GitHub keeps commits a force-push abandons, readable by id, and pull-request refs keep the old history; only GitHub Support can purge either. Issue edit histories and closed issues would remain as they are |
| Built as `agenthix-new`, then the two renames — owner, 2026-10-12 | All the slow work happens beside the current repository; the switch is minutes, and until then undoing is deleting one repository |
| `docs/work/` moves with the tree, swept | The delivery record, the epic records and the decision records cite the units of work; dropping them breaks those links |
| The new repository private until it goes public — owner, 2026-10-12 | When it goes public is decided outside this repository; going public is then only a setting |
| The project board and issue fields set up again, not copied | They are joined to issues, and the issues are new; the script sets each issue's type, fields, parent and board item |

## Work breakdown

### Phase 1 — The tree made ready

**Delivers:** a tree with no secret, no private reference and one version, whose checks pass on GitHub.
**Starts when:** this plan is committed on `main`.
**Execution plan:** none — the scans by agents, the test fixes by one lane, the rest by hand.

- [x] 1.1 The whole history and the tree scanned for secrets, with gitleaks
- [x] 1.2 Every live secret the scan found rotated, and the tree holds none — none found: every finding is a test fixture
- [x] 1.3 The tree swept for private references — repository names, internal tooling, personal paths and internal identifiers — and each fixed
- [x] 1.4 One version, `0.1.0`, in every package
- [x] 1.5 hq's unit and integration tests pass on a clean machine: complete icon stand-ins, the connection pool, and two timing-sensitive tests
- [x] 1.6 The pull-request checks workflow lands, passing on GitHub
- [x] 1.7 Every open issue exported and cleaned, and the set passes the deny-list, gitleaks, a second agent's reading and the owner's review
- [x] 1.8 The script that recreates the issues under their own numbers, with their types, fields, parents and board items, and checks each before and after
- [x] 1.9 The script rehearsed end to end between two throwaway private repositories

### Phase 2 — The new repository, and the switch

**Delivers:** the platform worked from `solution84-com/agenthix`, a private repository whose history starts clean.
**Starts when:** phase 1 is merged to `main`, the cleaned issues are approved, and the owner approves starting.
**Execution plan:** none — by hand, step by step, each step that renames, archives or is seen by anyone approved on the day.

- [x] 2.1 `agenthix-new` created, private and empty
- [x] 2.2 The open issues recreated there under their own numbers, and read back clean
- [x] 2.3 Its settings: secrets, Discussions, branch protection, private vulnerability reporting, the project board, and the contributor agreement's check — vulnerability reporting and the agreement's check on the day it goes public (Deviations)
- [x] 2.4 `main`'s tree pushed as its first commit, and its checks and the guide's screenshots pass
- [x] 2.5 The switch: the current repository renamed `agenthix-<date>`, then `agenthix-new` renamed `agenthix`
- [x] 2.6 Local clones, worktrees and the tools that read this repository pointed at the new one
- [x] 2.7 `agenthix-<date>` archived, once the owner is satisfied

## Deviations

| What changed | Why |
|---|---|
| Task 1.4 sets the version in every package only; the images and the installer do not carry it yet | Today no image is labelled with a version and hq reports `dev` outside development: the installer builds images from source with no version passed in. *Host management* replaces the installer and how images are built, so the version goes in there |
| The open issues are recreated under their own numbers in a repository built beside this one, not moved with every link rewritten | The owner's calls, 2026-10-12: a moved issue keeps its edit history; recreating in order keeps every reference true; building beside the current repository makes the switch two renames |
| An open issue whose parent is closed is recreated without a parent | The rehearsal found it; a closed parent is not recreated, so there is nothing to attach to |
| Two issues are recreated under new numbers, and the references to them follow | GitHub used up three numbers on failed creates during the runs. The first loss restarted the run; the script then learned to create an issue whose number was lost after the last number and record the move. Every other open issue kept its number |
| hq's placement of a person's storage now survives two simultaneous first resolutions | The new repository's first checks caught the race on a 2-CPU runner: an upsert with a relation select is not atomic. Fixed in the unit, since its checks must pass |
| Private vulnerability reporting and the contributor agreement's check (CLA Assistant) are set up on the day the repository goes public, not now | GitHub refuses private vulnerability reporting on a private repository, and CLA Assistant lists only public repositories without access to every private one; no outside pull request can arrive before then. Recorded on *Ready for outside users and contributors* |
| The switch kept the local folder: its `.git` was replaced by the new repository's, after a full copy of the folder was kept as a backup | The new repository's tree is the folder's tree, so nothing on disk moved; the old history stays in the backup and the archive, never one push away from the public repository |
| Also done in this unit: the documentation audited against the code; contributors' role, credit, conduct and squash-merged pull requests written down; skills moved to `.agents/skills`; an organisation-wide audit of public repositories, kept outside this repository | The owner's calls during the unit, 2026-10-12 and 2026-10-13: each was needed for the repository to be ready for outsiders |

## Closing note

**2026-10-13.** Accepted by the owner. The platform lives in `solution84-com/agenthix`, a private repository whose
history starts with one commit of the tree; the earlier repository is kept, archived and private. The 201 open
issues were recreated from cleaned text under their own numbers, except two given new ones. Closed in
the unit: the tree's private references, the old architecture in the living documents, hq's tests on clean machines
and a storage placement race they exposed. Deferred as issues: the sign-in limit under a burst (Blocks release,
raised in the unit), seven more (none blocks release), and the image version on *Host management*. Release-blocking
work still open from before: under *First release*. No QA audit ran; the unit changed behaviour only in the storage placement race, whose
test was already in the contract's scenarios. No decision records were touched. The repository goes public on the
day the owner decides, with vulnerability reporting and the agreement's check set up then.
