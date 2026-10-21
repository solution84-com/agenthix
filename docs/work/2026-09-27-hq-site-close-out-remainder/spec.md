---
created: 2026-09-27
description: What the hq/site close-out left unmet when its objectives were checked against the code — six of ten objectives do not pass — and what each must do to pass.
---

# hq/site Close-out, What Remained — Design

**Succeeds:** the unit `2026-09-15-hq-site-split-close-out`, which closed on 2026-09-26 with its
milestone's objectives not all passing. That unit is closed and is not reopened; this one takes over
the objectives that did not pass.

**The milestone and its objectives** are on the platform roadmap as *hq/site split closed out and
secured*, and it is still in progress. This spec does not restate the objectives; it says what each
unmet one needs.

---

## Scope rule

**A thing is in this unit if it contributes to one of the milestone's objectives.** A release blocker
or a critical bug that does not is not in this unit: it is planned into a milestone before release, so
it does not hold this one open. A milestone that keeps taking in every blocker it meets never finishes.
**Time is not a criterion.** The last unit's milestone went unclosed because its scope was cut to fit
a schedule; here the schedule gives way instead. If the work runs past the milestone's finish date, the
milestone finishes late and the variance says so. Everything else queues as an issue, with the priority
it already has, for the triage milestone or a later one. **Design work an objective needs is done in
this milestone, in phases of its own, and is never deferred to let the milestone close** — a deferred
design is an objective that does not pass.

---

## 1. The problem

On 2026-09-27 each objective's outcome was checked against the code, tests, migrations and compose
files, not against the closed unit's records. Four pass. Six do not, or pass only in part:

| Objective | State | What is missing |
|---|---|---|
| hq reaches its execution layer only through the control channel | Partly | Two disk reaches remain: the boot relocation of old data, and the task dispatch payload's roadmap path |
| hq and a site deploy to separate machines | Does not pass | Proven on one machine only. No task run has completed, and no second machine was used |
| One view across every site | Partly | First storage, heartbeats and the model-login store go to the oldest registered site, not the default one. Some screens turn "could not ask the site" into "nothing there" |
| Sites behind NAT or firewalls stay reachable | Does not pass | No preview can be opened on any topology, and the NAT case has been exercised on loopback only |
| A run reaches only what the person behind it can reach | Partly | An agent's detail page shows a private project's run inputs and outputs to anyone signed in. The non-SDK runtime's file tools check a path and then use it, in storage that every agent in a project now shares, so another agent can steer a write outside the project |
| An agent is a versioned package | Partly | A site takes the latest version at each run: there is no resync and no project pin, and the design built no site override layer |

The four that pass are a fresh install working end to end, a site's credential rotating and its
revocation taking effect, nothing the split left open being reachable without authorisation, and one
site being unable to act on another's data.

A compose-deployed hq also sends a task path that exists on no site, so a task run would fail on a
separate machine even after the rest is proven. That is inferred from the code and has not been run.

## 2. What each piece must do

Each piece is one branch of work. "Passes when" is what can be shown at the end.

**2.1 hq stops reaching a site's disk.** The boot relocation of old data is removed, and the task
dispatch payload carries a reference the site resolves rather than a path into its disk. Passes when
nothing in hq reads or writes a site's disk, and the deployment guide no longer assumes a shared
filesystem.

**2.2 Reads honour project entitlement, and say when a site is silent.** An agent's detail page keeps
only the runs of projects the viewer is entitled to, by the rule its sibling reads already use. A
session's owning site is not cached across a placement change. Screens that ask a site show that it
could not be asked, rather than an empty result. Passes when a person outside a private project sees none of its run inputs or outputs,
a moved session's frames are accepted from the new site at once, and a site outage never reads as an
empty folder or an empty list.

**2.3 A deleted project's runs are traced.** Stop all stays an administrator-only brake over the
organisation, and everyone else stops only their own sessions (decision 2), so the objective's wording
is corrected to that and nothing is built for it. One question remains that could touch the objective:
deleting a project does not cancel its running work first, and what a run then does was never traced.
Passes when it is known whether a run keeps reaching a deleted project's storage. If it does, that is
fixed here, since a run would then reach something the person can no longer reach; if not, nothing is
built and the rest of the stopping-work issue waits for triage.

**2.4 Placement uses the default site.** The function that answers "which site does work with no
storage of its own go to" is named for the default site and ignores the row marked as the default: it
takes the oldest registered site that has a credential. First storage, heartbeats and the model-login
store follow it. It is changed to return the site marked as the default and nothing else, and its
comment, which still says hq creates no site of its own, is corrected. With no default site the
existing error stands. Passes when, with two sites registered, work with no storage goes to the
default one whichever registered first, and a test says so.

**2.5 Leftovers.** The stale statements the close-out left are corrected: the comments that describe
the pre-split shape, the job-runner note, two shipped skills that point at a wiki that is gone, the
units listed as open in the work register, and the deployment guide's shared-filesystem line. Passes
when each statement matches the code.

**2.6 Secrets at rest.** What the issue on encrypting platform secrets still leaves in plain text is
found first — the record of its earlier closure says fixed and the code says only partly — and then
encrypted, including the site's own credential to hq. Passes when a read of either database yields no
working credential that hq or a site stores itself, and a test says so for each place one is stored. One
exception is accepted, decided 2026-09-27: the sign-in session ids in the framework's own session table
are stored as is, as the framework is built; storing a hash instead is its own issue. Values already stored in plain
text are not converted — the project works from a clean state — so they are discarded and entered
again. A schema change, if one is needed, follows the migration process in `CLAUDE.md`, run once by
the lead.

**2.7 The file tools act on what they checked.** The non-SDK runtime's file tools run in the site's own
process, so their path check is the whole boundary between an agent and the rest of the disk. They
check a path and then use it, and the root they check against is now storage shared by every agent in a
project. Passes when a link planted between the check and the use cannot steer a read or write outside
the project, and a test says so. Afterwards, whether hq's own check-then-use in agent-writable folders
still applies is checked: once hq stops touching a site's disk (§2.1) it may have nothing left to
race, in which case that issue is closed as moot.

**2.8 Previews name their viewer, and are served safely.** *Designed first, then built.* A preview
request must identify who is asking, so the per-requester rule in the live-preview architecture note can
run, and a previewed page must not be able to act as the person viewing it. Every claim in the issue that raised it was checked
against the code and holds: a browser following a link cannot send the bearer header, hq sets no cookie,
and deployed, previews share hq's origin, so once they load an agent's script could read the viewer's
session and act as them. The design settles the viewer's identity and where a preview is served from, and
writes the decision record that where-it-is-served-from binds later work. Passes when a signed-in person
entitled to a preview can open it from a link, one who is not cannot, and a script in the previewed page
cannot read or use the viewer's session; and a test says each.

**2.9 An agent is defined once in hq and overridden per boundary.** *Designed first, then built* —
adr-0072, which supersedes adr-0059. An agent is one current definition held by hq — identity,
instructions, heartbeat text, skills and settings — edited in place with no version number or publish
step. A run is delivered it by content fingerprint; a site fetches content it does not hold once, caches
it and never alters it, and the run records the fingerprint. A project, or a person in their own space,
overrides on top: narrower settings, added instructions, and skills for one agent or for every agent in
that boundary. There is no site layer. The organisation's and the platform's content are delivered the
same way. Before the first release the package tables are wiped, not converted. Passes when an edit to
an agent reaches the next run on every site with no publish step; a site fetches a definition once and
reuses its cache while it is unchanged; each run records the fingerprint it ran with; a skill placed once
in a project's or a person's boundary reaches every agent working there; and no reader keeps a second
copy of an agent's settings. A test says each.

**2.10 The two-machine walkthrough — moved to the release's final checks.** Decided 2026-09-27: running
hq and a site on two machines is a deployment check, done once on the real deployment before the
repository goes public, not rehearsed here on a separate environment. What this milestone proves
instead: the site shares no disk with hq and never takes an inbound connection, by design and by the
code; and registration, dispatch, streamed output, reconnect and revocation work over the real channels
on every full regression (the cross-app suite).

---

## 3. Open decisions

Each is settled before the piece that depends on it, and the answer is recorded here in place.

1. Can the boot relocation of old data simply be removed? **Decided 2026-09-27: yes.** The project works from a clean state before its first release: it writes no migration of existing data or file layout, and old disk locations are ignored or wiped.
2. What does stop all mean? **Decided 2026-09-27: it stays what the close-out design (§6.4 of the
   previous unit's spec) made it — an administrator-only brake over the whole organisation, with
   everyone else stopping only their own sessions.** The objective's "the kill switch stops only what
   you own" came from the audit finding that let any user stop everyone's work, and is corrected to
   this. Whether it should pause heartbeats or hold queued tasks does not serve an objective, so it
   waits for triage.
3. What does placement do when no default site exists? **Decided 2026-09-27: moot as a design question.** Every install brings hq and one site as a pair (ADR-0070), so a default site exists by design; without one, hq's own boot log says so and it means the pairing secret is missing or too short. hq never invents a site, so the existing "no Execution Site is connected" error stands and nothing falls back. What is left is that placement ignores the default site's marker and takes the oldest registered site (§2.4).
4. How does a preview identify its viewer, and where is it served from? **Decided 2026-09-27, recorded
   as adr-0071:** a preview is served from a host name of its own under a preview domain the install's
   operator sets (under hq's domain, or a second domain for stronger isolation; `*.localhost` on a
   developer's machine needs no setting), never from hq's origin. Where a deployed install sets none,
   previews are off and refused. hq identifies the viewer with a one-time ticket (the access check — invisible to someone already signed in to hq), checked against the
   preview's storage boundary, which the preview host exchanges for a cookie bound to that host alone. A
   spike in a real browser showed a preview on hq's origin reading the viewer's sign-in and acting as
   them, and that a sandbox policy or a separate port does not give a working, isolated preview. All
   preview traffic still crosses hq (adr-0063); the host-based addresses leave room for a separate relay
   or a direct path to a reachable site later, without changing addresses or the access check.
5. What does the versioned-package objective keep promising? **Decided 2026-09-27, recorded as adr-0072:**
   an agent is defined once in hq and overridden per boundary, with no version numbers. The objective is
   reworded to that. A per-boundary skills folder that every agent in the boundary receives is part of
   it, for projects and for a person's own space. The package pin, the version floor
   and orphaned versions are moot, and the `Agent` row's leftover behaviour columns are answered by it. Everything a version held is wiped,
   not converted — nothing has been released.
6. How are the totals scoped? **Decided 2026-09-27 by the scope rule: out.** The run and token totals
   are aggregate counts; nobody can reach a run's content through them, so they serve no objective.
   They wait for triage. The outage half of the same issue stays, because a site outage reading as an
   empty screen defeats *One view across every site*.
7. The delivery record shows the milestone as done on 2026-09-26. Rows are never edited: is a correcting
   row appended now, or does the record wait for the real close?
8. Does the combined branch merge to `main` before the two-machine walkthrough, or after? **Moot, 2026-09-27:** the walkthrough moved to the release's final checks.
9. Which release blockers ride in this unit? **Decided 2026-09-27: those that contribute to an
   objective.** The walkthrough does. Password recovery and the first-administrator code do not: the
   fresh-install outcome as written is onboarding, an agent with its identity files, and the
   organisation file, and it passes. They are planned into the milestone that opens the repository to
   outside users. The full QA audit, the public-history cleanup, the licence and the vendor's written
   confirmation are planned before release, each in its own place.
10. The two check-then-use bugs. **Decided 2026-09-27: the non-SDK file tools are in, hq's own check
    is a check at the end.** The file tools are the boundary of a run in a project's shared storage, so
    they serve *A run reaches only what the person behind it can reach* — and the root they check
    against was widened by this milestone's own work. hq's real-path check is bounded by hq's reach into
    a site's disk, which §2.1 ends; it is re-examined once that lands (§2.7).

## 4. Out of scope

Each is out because it fails the scope rule, not because of the time it would take.

- **Stop all's confirmation, result, heartbeat pausing and race with re-runs.** They are about whether
  the brake works, not about who can reach what. The one item that could touch an objective, a deleted
  project's running work, is traced in §2.3.
- **The run and token totals** scoped by project (decision 6).
- **The full QA audit.** Its own unit, and it has to run after the fixes it would otherwise re-find.
  It blocks the release, and it is planned before release on the roadmap, not here.
- **The public-history cleanup, the licence, the vendor's written confirmation, and password recovery
  with the first-administrator code.** Each blocks the release, and none contributes to an objective of
  this milestone. Each is planned before release, so none holds this one open.
- **A scan of the routes hq registers outside the framework's router.** Never done, and worth doing, but
  it serves no objective of this milestone. Its preview-proxy half is covered by §2.8. It is planned
  before release with the triage.
- **Every other open bug, debt and chore.** They queue at the priority they already have, for the
  triage milestone. Any that turns out to be critical by the scope rule moves in.
