---
created: 2026-09-15
description: Finishing the hq/site split and settling the run security boundary with it — the work that needs no design first, then the interlocked questions designed together and built in dependency order, the independent questions each designed and built, then one close-out.
---

# Implementation Plan · hq/site Split Close-out

> **Closed 2026-09-26: this plan is a record; what was built is in the register and the Deviations table below; the walkthrough register below stays as history.** It is not edited again. The register ([`issues.md`](issues.md)) holds every open item this unit surfaced and how each ended; the Deviations table holds every change of direction, by phase. The design spec ([`spec.md`](spec.md)) reads as the design as it finally stood, corrected in place while the unit ran.

**Design spec:** [`spec.md`](spec.md)

## Goal

hq and its sites run on separate machines, a run reaches only what it is entitled to, and no critical
bug from the hq/site split remains.

**In scope:** everything in the spec — the work that needs no design (§4, both parts), the questions
still to design and what their answers require building (§5), and closing both this unit and the
split's own unit.

**Out of scope:**

- **Site decommissioning, several mounted locations per session, and the project knowledge
  convention.** Real, but none is critical by the spec's definition (§2). They are open items the
  split left, so they are raised as issues when its unit closes (Phase 13) rather than silently
  dropped.
- **The hand-synced forwarded-tool table.** Debt, not critical; raised as an issue at close for the
  same reason.
- **CI for the cross-app test tier, and the stale `README.md` / `AGENTS.md`.** The roadmap's *Open
  to outside users* milestone already carries both — every change checked before it merges, and a
  contributor able to orient from the documentation.

## Approach

**No-design work first.** Items with one obvious correct behaviour, readable off the code as it
stands, are done before any design (spec §4). The first part — fourteen items the split left — is
merged. The second part is the security and breakage fixes found after it: they close exposures now,
and remove defects the design would otherwise have to work around.

**Then the interlocked questions are designed together, in one phase.** Storage and placement, the
agent package, authority, ownership rules, hq's disk access, preview, and reads across sites each
constrain the others (spec §5.1–5.7). Designed one at a time, each would be settled against answers
not yet given, and the later ones would reopen the earlier. The design phase settles all seven on its
branch, writes the decision records they call for, and writes the build tasks for the phases that
build on it.

**The design merges ahead of its builds, and the spec says what is built.** The joint design feeds
six build phases. Holding it on its branch until they finish would keep six phases of work unmerged
on one branch — the split's failure. So it merges on its own, and the spec marks each part of the
design as settled and not yet built until the phase that builds it merges.

**The builds follow the design's dependencies.** Where things live comes first — the storage boundary,
the agent package and hq's disk access, with content crossing the control channel once for both. Who
may do what builds on it. Preview and reads across sites follow, since both depend on where files
are read and runs are placed. The design re-cut these into six phases, and Phase 5 later split
into three, both recorded as deviations.

**The independent questions keep their own phases.** Credential rotation and operator console
authentication depend only on Phase 1, and nothing depends on them but the deployment. The deployment
shape comes last: it is where running apart is proven end to end, and it needs hq standing alone and
a site's console safe to expose.

**Every phase merges back to `main` on its own short branch.** A phase cuts a branch from `main`
before any design or code, and merges with `--no-ff` once the full test suite and both apps' type
checks pass and its entries are in the walkthrough register. One issue tracks the unit; a phase raises no
issue of its own, and closes the existing issues it resolves when it merges. Those steps are the
workflow, not the work, so no phase's breakdown lists them. Phases 1–11 raised a sub-issue each
before this was settled.
A critical item a merged phase leaves open may sit on `main` — it cannot reach a release while its
issue is marked **Blocks release**.

**QA happens after the walkthrough, and the full audit is its own unit.** Phases write tests test-first and run them; no stories or
scenarios are authored and no requirement → scenario → test chain is checked in the build phases. Phase 13 brings the QA contract
into line with the behaviour this unit removed; the full QA audit of `core`, `hq`, `site` and `ui` is a unit of work of its own,
run after this one closes and before any release, tracked by its own issue (**Blocks release**).

| Roadmap objective | Phases |
|---|---|
| hq reaches its execution layer only through the control channel | 1 (dial-out client), 3, 5, 7, 9 |
| A fresh install works end to end | 1, 2 |
| hq and a site deploy to separate machines | 12 |
| One view across every site | 1 (session updates), 2, 3, 9 |
| Sites behind NAT or firewalls stay reachable | 3, 9 |
| A site's credential rotates, and revoking a site takes effect | 1 (revocation), 10 |
| Nothing the split left open is reachable without authorisation | 1 (storage reads), 2, 8, 11 |
| A run reaches only what the person behind it can reach | 2, 3, 4, 6, 8 |
| One site can't act on another site's data | 1, 2, 3, 6 |
| An agent is a versioned package | 3, 5 |
| Bonus — split leftovers that are done or easy are closed | 1 (§4.12–4.14), 13 |

## Decision records

| | Records |
|---|---|
| **Depends on** | [ADR-0039](../../adr/adr-0039-files-and-workspaces.md) · [ADR-0042](../../adr/adr-0042-hq-is-the-orgs-own.md) · [ADR-0044](../../adr/adr-0044-execution-site-registration-flow.md) · [ADR-0045](../../adr/adr-0045-request-response-on-the-control-channel.md) · [ADR-0050](../../adr/adr-0050-dispatch-and-status-cross-the-control-channel.md) · [ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) — all Accepted |
| **Implements** | [ADR-0042](../../adr/adr-0042-hq-is-the-orgs-own.md) — an org's HQ and its Execution Sites run apart · [ADR-0050](../../adr/adr-0050-dispatch-and-status-cross-the-control-channel.md) — hq dispatches and executes nothing |
| **Revisits** | [ADR-0047](../../adr/adr-0047-where-a-run-may-execute.md) — agents pinned to one site, which the storage and placement design may replace (Phase 3) · [ADR-0048](../../adr/adr-0048-partitioning-an-agents-memory-of-a-person.md) — the per-person memory partition mounted into a run, which a storage-bound container cannot keep (Phase 3) · [ADR-0049](../../adr/adr-0049-the-session-is-the-container-boundary.md) — containers keyed by session, which the storage design may key by storage location (Phase 3) · [ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) — package delivery and preview traffic may cross the channel in shapes it did not consider (Phase 3) · [ADR-0039](../../adr/adr-0039-files-and-workspaces.md) §10 — the `tasks/` storage kind, if task attachments move to hq's own storage (Phase 3) · [ADR-0044](../../adr/adr-0044-execution-site-registration-flow.md) — re-registering silently rotates a credential, and rotation without re-registering was left open (Phase 10) · [ADR-0040](../../adr/adr-0040-hq-issued-token-ttls.md) — lifetimes, if the machine credential gains one (Phase 10) |
| **Writes** | Phase 3 settled the joint design and cut eight records: [ADR-0056](../../adr/adr-0056-a-run-is-placed-on-the-site-holding-its-storage.md) placement · [ADR-0057](../../adr/adr-0057-a-container-is-bound-to-one-storage-location.md) the container boundary · [ADR-0058](../../adr/adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md) memory · [ADR-0059](../../adr/adr-0059-an-agent-is-a-versioned-package.md) the agent package · [ADR-0060](../../adr/adr-0060-authority-comes-from-the-boundary.md) authority · [ADR-0061](../../adr/adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) grouping · [ADR-0062](../../adr/adr-0062-people-are-members-agents-are-assigned.md) membership · [ADR-0063](../../adr/adr-0063-preview-traffic-crosses-on-its-own-transport.md) preview traffic. ADR-0047, ADR-0048 and ADR-0049 are superseded by 0056, 0058 and 0057; ADR-0051 and ADR-0046 are confirmed and cited · Phase 11 cut two: [ADR-0064](../../adr/adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md) registration, which supersedes ADR-0044's token-upfront flow · [ADR-0065](../../adr/adr-0065-a-site-serves-no-web-page.md) the site has no operator page · Phase 12 cut four: [ADR-0066](../../adr/adr-0066-a-site-reaches-its-agents-over-a-private-network-per-boundary.md) a private network per boundary · [ADR-0067](../../adr/adr-0067-hq-ends-at-one-plain-http-port.md) hq ends at one plain-HTTP port · [ADR-0068](../../adr/adr-0068-hqs-browser-app-is-built-for-its-address.md) the browser app is built for hq's address · [ADR-0069](../../adr/adr-0069-images-are-built-with-only-docker.md) images are built with only Docker · Phase 13 cut one: [ADR-0070](../../adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md) hq and its own site are connected by configuration |

**How each ended, at the close.**

- **Depends on.** All six are Accepted. ADR-0044's registration flow was superseded by ADR-0064 during this unit (Phase 11), so the work rested on it only until then; the rest of ADR-0044, the handling of the credentials, still stands and binds ADR-0064's flow.
- **Implements.** ADR-0042 and ADR-0050 each carry a dated note saying what acted on them: the topology cut, then this unit's Phase 7, which took hq's reads and writes of a site's disk over the control channel (two expressions remain, named in register row R-011), and Phase 9, after which hq starts no containers.
- **Revisits.** ADR-0047, ADR-0048 and ADR-0049 were disproved and superseded in Phase 3 (by ADR-0056, ADR-0058 and ADR-0057). ADR-0051 survived: preview traffic took its own transport (ADR-0063) precisely so the channel kept its typed-events rule. ADR-0044 was superseded in its registration flow only (ADR-0064) and its credential handling survived. ADR-0040 survived: the machine credential gained no lifetime, by design (rotation is an admin's act from hq). ADR-0039 §10 survived in its `tasks/` storage kind but was disproved in its task-run access model, which made the mounted set depend on the session type and the run's working directory its own task folder: a container is now keyed by the owner alone (ADR-0057), so a task run mounts the project's whole `tasks/` root.
- **Created and still Proposed.** None. ADR-0056 to ADR-0070 are all Accepted.

## Key decisions

| Decision | Why |
|---|---|
| One unit, one spec, one plan | The questions share one goal, one milestone and one close-out, and their open items belong to one triage |
| **Against:** a separate unit per design question | Many close-outs, QA audits and triages over the same modules, and open items scattered across units — the split's failure again |
| The run security boundary is part of this unit, not the milestone after it | Where storage lives, where an agent's package is held and whose authority a run carries each depend on the others and on hq's disk access, reads across sites and preview; the storage boundary is the split's own unanswered question |
| **Against:** the security boundary as its own milestone after this one | This unit would design hq's disk access, placement and preview against a storage model the next milestone replaces, and build them twice |
| Each phase merges to `main` on its own branch | Nothing waits unmerged beyond one phase; leftovers surface at each merge rather than at the end |
| **Against:** one branch for the whole unit | The split did this — one branch across six plans, merged at the end, with its leftovers unseen until then |
| The work that needs no design comes before any design | Fixes breakage and exposures now, and removes defects the design would otherwise work around |
| The seven interlocked questions are designed together, in one phase | Each constrains the others; designed in turn, each would be settled against answers not yet given |
| **Against:** one design phase per question, each followed by its build | The earlier designs would be built before the later ones could change them |
| **Against:** designing all ten questions together | Rotation, console authentication and deployment neither depend on the seven nor are depended on by them, so they would wait for nothing |
| The joint design merges to `main` ahead of its builds, with the spec marking what is not yet built | Three build phases depend on it; holding it on its branch would keep three phases unmerged at once |
| **Against:** holding the design on its branch until its builds merge | The split's failure — several phases of work on one branch, merged at the end |
| An independent design phase settles its question in the spec on its own branch, then builds there | The design, its plan change and its build land on `main` together in one merge |
| A design that does not resolve is moved to `main` as unresolved design, or discarded | Unresolved design lives on `main`, where it stays visible without claiming to be true |
| Revocation in Phase 1; rotation in Phase 10 | Revocation uses a frame the protocol already has. Rotation is a question ADR-0044 left open |
| Deployment shape designed last | It proves running apart end to end, so it needs hq standing alone (Phases 7 and 9) and a site's console safe to expose (Phase 11) |
| **Against:** fixing the compose files early | The deployment design rewrites them |
| QA contracts written only at close | The org's rule: contracts written against moving behaviour are rework, and the audit's findings belong in the close-out triage |

## Work breakdown

Fifteen phases. Phases 1 and 2 are the work that needs no design. Phase 3 designs the seven
interlocked questions together, and Phases 4 to 9 build them — 5 splits into 5, 5b and 5c, which are
three subsystems that barely touch. Phases 10–12 are one independent question each. Phase 13
closes the unit.

**Build tasks are added when their design settles**, as a deviation — for Phases 4–9 at Phase 3, and
for Phases 10–12 on their own branches. Until then a breakdown shows only the tasks already known.

### Phase 1 — The work that needs no design
**Delivers:** spec §4 — onboarding completes on a fresh install, agents get their identity files and
`ORG.md`, storage reads and session updates are authorised, revoking a site takes effect, and hq no
longer carries the dial-out client.
**Starts when:** —
**Execution plan:** yes — fourteen changes across `core`, `hq` and `site`, each written test-first,
plus two migrations; the spec says what each must do, not which files and tests carry it.

The bonus tasks, 1.15–1.18, are cut first if the phase has to shrink.

- [x] 1.2 Onboarding reads the kernel's agenda from its real asset path (§4.1)
- [x] 1.3 Provisioning copies an agent's identity files from the template's real path (§4.2)
- [x] 1.4 `ORG.md` written where agent containers mount shared org files (§4.3)
- [x] 1.5 Storage list and read operations enforce location access (§4.4)
- [x] 1.6 Session status and stream updates accepted only from the site that owns the session (§4.5)
- [x] 1.7 Revoking a site sends it the revoke frame and closes its open channel (§4.6)
- [x] 1.8 Dispatch refuses a revoked site (§4.6)
- [x] 1.9 Dial-out client, its settings page and navigation, query and actions removed (§4.7)
- [x] 1.10 Migration dropping `HqConnection` and its three `UserSettings` fields — run only with explicit approval (§4.7)
- [x] 1.11 Preset tools read the preset folders the UI reads (§4.8)
- [x] 1.12 Deleting an org library skill removes its source (§4.9)
- [x] 1.13 `request_workspace_git` no longer advertised to agents (§4.10)
- [x] 1.14 Code comments describing the pre-split shape corrected (§4.11)
- [x] 1.15 Prompt preview carries its sections across the control channel (§4.12)
- [x] 1.16 Site writes auto-generated session titles; hq's naming service removed (§4.13)
- [x] 1.17 Execution Sites settings page keeps each site's link status current while open (§4.14, revised)
- [x] 1.18 ~~Credential-health badge~~ — folded into 1.17; see Deviations
- [x] 1.18a Final-review fixes: a rename is not overwritten by the auto-title; revoking a site fails its held and running tasks
- [x] 1.20 ADR-0051's residual on session ownership corrected to what Phase 1 closed
- [x] 1.21 `docs/architecture/site-auth.md` no longer describes the dropped `HqConnection` and `UserSettings` fields

### Phase 2 — Security and breakage fixes that need no design
**Delivers:** spec §4, second part — attachment names and planted links cannot reach outside a
location; repo and skill operations check access and names before touching disk; one site
cannot archive another's session, and a transient lookup failure does not lose a frame; the
unauthenticated and over-exposed reads are closed; a repo link cannot send its token to another
host; agent handles and project ids cannot choose a path; writes under an agent's private folder stay
inside it; a fresh install seeds
the kernel's files where it reads them, and has hq's bundled assets.
**Starts when:** Phase 1 is merged.
**Execution plan:** decided at 2.3.
**Scope is frozen at 2.18.** Anything found while this phase runs is recorded in the close-out register by its
kind, not added as a task.

- [x] 2.2 hq's bundled assets tracked in the repository again (§4.25)
- [x] 2.3 Execution-plan call made — yes, one execution plan for the phase
- [x] 2.4 An attachment's file name cannot place it outside its folder (§4.15)
- [x] 2.5 hq's file reads refuse a target whose real path leaves its location — explorer and agent image route (§4.16)
- [x] 2.6 Repo state, connect and disconnect apply the location access rule (§4.17)
- [x] 2.7 ~~Git operations hq runs inside a location run no hooks or configuration found there~~ — moved to the joint design (§5.5); see Deviations
- [x] 2.8 Library skill creation and project skill install and removal validate name and project before touching disk (§4.19)
- [x] 2.9 A task's terminal frame archives only that task's session (§4.20)
- [x] 2.10 A transient session-owner lookup failure does not drop a terminal frame (§4.21)
- [x] 2.11 System status requires sign-in; the run list returns only runs the caller may see (§4.22)
- [x] 2.12 ~~The invite rate limit holds across restarts and instances~~ — moved to credential rotation (§5.8, Phase 10); see Deviations
- [x] 2.13 The kernel's identity and onboarding files are seeded where the kernel reads them (§4.24)
- [x] 2.14 Linking a repo accepts only a `github.com` URL (§4.26)
- [x] 2.15 Agent handles are validated on creation and rename (§4.27)
- [x] 2.16 Creating a project takes only the fields a project may be given (§4.28)
- [x] 2.17 Task session and task run queries require sign-in (§4.29)
- [x] 2.18 Writes and deletes under an agent's private folder refuse a target whose real path leaves it (§4.30)

### Phase 3 — The joint design
**Delivers:** spec §5.1–5.7 settled together — storage and placement, the agent package, authority,
ownership rules, hq's disk access, preview, and reads across sites — with the decision records they
call for, and the build tasks for the phases that build it.
**Starts when:** Phase 2 is merged — the design reads the code as the fixes leave it.
**Execution plan:** none — a design is settled in conversation; the build phases decide their own.
**Inputs:** the proposals for the storage boundary and for agent identity not being authority.

- [x] 3.2 Which of today's membership-derived container mounts runs actually rely on — established from the code before the storage design (the first proposal's prerequisite)
- [x] 3.3 Design settled in spec §5.1–5.7 on the phase branch, each answer checked against the others — written up as §6.1–6.7
- [x] 3.4 Decision records written for what the design settles; ADR-0047, ADR-0048, ADR-0049 and ADR-0051 each superseded, amended by a new record, or confirmed to hold
- [x] 3.5 Both proposals closed — completed where a record now holds the decision, not planned where it does not
- [x] 3.6 Build tasks written into the build phases, their seams confirmed or re-cut, and each phase's execution-plan call made — recorded as a deviation
- [x] 3.7 Spec §5's seven interlocked questions each point at the section of §6 that settles them, marked designed and not yet built

### Phase 4 — Build: the ownership model
**Delivers:** a person and a project are the only owners of storage; a product and a programme group
projects and own nothing; people belong to projects, agents are assigned to them, and a project is
open or private with an admin of its own.
**Starts when:** Phase 3 is merged.
**Execution plan:** yes — a migration whose ordering is load-bearing, and checks that must not be
half-applied.
**Records:** [ADR-0061](../../adr/adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) ·
[ADR-0062](../../adr/adr-0062-people-are-members-agents-are-assigned.md)

- [x] 4.2 Today's agent-keyed `ProjectMember` renamed to `ProjectAgent`, and `ProductMember` removed — the rename lands before anything creates the new table (§6.4)
- [x] 4.3 `ProjectMember` created for people, with a project role of admin or member
- [x] 4.4 A project carries an access level, open by default, and every existing project is open after the migration
- [x] 4.5 Owner kinds narrowed to person and project: any workspace owned by a product or programme moves under a project, and the storage page stops offering them
- [x] 4.6 Filing a project under a product or programme is an org-admin act; the product directory helper and its dead path are removed (§6.4)
- [x] 4.7 Project screen shows members and agents as separate lists
- [x] 4.8 Inviting a person to a project, changing their project role, and removing them — refused where it would leave the project without an admin
- [x] 4.9 Removing a person from the org is refused where it would orphan any project, naming which ones

### Phase 5 — Build: the content transport
**Delivers:** a second connection between hq and a site that carries content, alongside the control
channel and without weakening its typed-events rule; and a version mismatch that reads as its own
state rather than as an unreachable site.
**Starts when:** Phase 3 is merged — independent of Phase 4.
**Execution plan:** yes — a new connection with its own registry, its own liveness rule and its own
failure vocabulary.
**Records:** [ADR-0063](../../adr/adr-0063-preview-traffic-crosses-on-its-own-transport.md) ·
[ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) ·
[ADR-0046](../../adr/adr-0046-protocol-compatibility-between-hq-and-sites.md)

- [x] 5.2 A transport that carries content between hq and a site, alongside the control channel and without weakening its typed-events rule (§6.5, §6.6). It needs its own registry — `SiteChannelRegistry` is keyed one-connection-per-site and closes any second socket, so registering there would evict the control channel — and its own liveness rule, since hq's ping counts completed frames and would terminate a transfer that takes longer than two intervals
- [x] 5.3 A major version mismatch shows on the Execution Sites page as its own state with the version required, distinct from unreachable, and the site keeps its registration and its credential (§6.5). Today it is an HTTP 400 at the upgrade, before authentication: hq's row is never touched, the site logs a generic socket error and sits in `DEGRADED`, and `SiteUnreachableError` would tell an operator the site is unavailable "until it reconnects" about a site that never will

### Phase 5b — Build: packages and delivery
**Delivers:** hq holds the agent, org and platform packages; a site fetches and caches a version it
does not hold; a boundary's overrides apply on top; and skills carry their source.
**Starts when:** Phase 5 is merged — the packages travel on its transport.
**Execution plan:** yes — one indivisible swap: the tasks that remove the mounts and the boot seeding
take away what every agent reads today, so nothing merges until the replacement is whole.
**Records:** [ADR-0059](../../adr/adr-0059-an-agent-is-a-versioned-package.md) ·
[ADR-0046](../../adr/adr-0046-protocol-compatibility-between-hq-and-sites.md)

- [x] 5b.2 hq holds published package versions — agent, org and platform — each immutable, with a manifest and a digest
- [x] 5b.3 Publishing: editing an agent's instructions or its behaviour settings mints a version; identity fields do not; publishing is an org-admin act (§6.3). Installing or removing an org skill publishes an org package version the same way
- [x] 5b.4 `PROFILE.md` and `RESPONSIBILITIES.md` merged into one `instructions.md`, for the shipped library agents and for existing agents; the frontmatter hq synchronises is removed — it already has no readers, and four paths leave it absent or stale
- [x] 5b.5 A site fetches a version it does not hold, verifies it, and caches it; a site too old for a package is refused with the reason, not sent older content
- [x] 5b.6 A site asked to start a run it has no cached package for, with hq unreachable, fails the run with a stated reason rather than running something else (§6.5 open points)
- [x] 5b.7 A boundary's overrides apply over a package — instructions and skills from the boundary's disk, model, tools and autonomy from hq — narrowing only
- [x] 5b.8 Skills namespaced by source, so an override adds rather than replaces, and a package's skills carry its version. Today four sources merge into one `Map` keyed on the bare slug and the scope is discarded at the loop head, so a run cannot say which skill it got
- [x] 5b.9 The `/shared` and `/assets` mounts are gone: org and platform content arrives as packages, the site's image stops carrying bundled assets, and the deploy step that copies them onto a site's disk is removed (§6.5). `/assets` is read by nothing inside a container today and exposes the whole platform asset tree; `/shared/org/skills` is a second copy the run never reads
- [x] 5b.10 hq's boot stops seeding a site's disk — the kernel's identity and skills, and the org's template content, are packages hq holds rather than files written under `SITE_ROOT`. On a dev machine `SITE_ROOT/assets` is a symlink into the repository, and hq fails to boot without it, so the replacement lands before the seeding goes
- [x] 5b.11 A site evicts cached packages by a stated policy, and a container already running keeps its version until the run ends (§6.2 open points)
- [x] 5b.12 Applying an agent template, a preset or a workforce template publishes a package version rather than writing identity files onto a site's disk
- [x] 5b.13 Importing and exporting an agent works on packages — an export is a version, an import publishes one

### Phase 5c — Build: memory held by hq
**Delivers:** what an agent knows about a person lives in hq rather than on a site's disk, in two
layers, and moves between them by promotion.
**Starts when:** Phase 3 is merged — independent of Phases 4, 5 and 5b. It rides the dispatch context,
which already exists.
**Execution plan:** yes — a store, two layers, a write-back path and a one-time move of what is on
disk.
**Records:** [ADR-0058](../../adr/adr-0058-memory-of-a-person-is-held-by-hq-in-two-layers.md)

- [x] 5c.2 hq holds global memory and one agent-memory partition per person and agent; both ride in the dispatch context and are written back through hq; promotion moves an item from an agent's partition to global. Today the partition is a directory on the site keyed on the agent's mutable handle, written only by the model on the strength of a prompt line, and never read back into hq

### Phase 6 — Build: placement and the container boundary
**Delivers:** a run happens on the site holding its storage and reaches exactly one owner's storage;
a container belongs to a storage location and is never rebound; the membership mounts and the agent's
own workspace are gone. **The agent's Claude credential directory stays** — moving it needs hq to hold
that credential and supply it per run, which is Phase 8's — so this phase does not claim §6.1's rule
that nothing agent-scoped is mounted.
**Starts when:** Phases 4 and 5b are merged — the boundary needs owner kinds settled, and an
unmounted agent needs its package to arrive some other way.
**Execution plan:** yes — the mount set, the container key and the idle sweep change together.
**Records:** [ADR-0056](../../adr/adr-0056-a-run-is-placed-on-the-site-holding-its-storage.md) ·
[ADR-0057](../../adr/adr-0057-a-container-is-bound-to-one-storage-location.md)

- [x] 6.2 A run is placed on the site holding its primary storage; choosing a location decides the site, and an agent is no longer pinned
- [x] 6.3 The membership-derived mounts are removed — a run reaches its own boundary and nothing else
- [x] 6.4 A container is keyed by storage location, named and swept by it, and never rebound to another owner
- [x] 6.5 A member subspace under a project holds that person's drafts and agenda; the agent's own agenda directory goes
- [x] 6.5a A person's own storage carries a `knowledge/` tree, read by agents running in their own space (§6.1)
- [x] 6.6 Artefacts follow the boundary the work was done for; the agent's workspace and its per-person memory directory are gone. The private directory's path survives for one hq route that still serves it, which Phase 7 takes with the rest of hq's disk access
- [x] 6.6a Renaming an agent moves no directory and stops racing its running containers (§6.2)
- [x] 6.6b `Agent.homeSiteId` and the site-placement path that fills it are removed — an agent has no home site, and a run's site is resolved from its storage
- [x] 6.6d Deleting an agent removes its package versions and its memory partitions, and touches no site's disk
- [x] 6.6c `volumeRemountPending` and the control-channel operation that clears it are removed — nothing remounts when memberships change, because memberships no longer decide mounts
- [x] 6.7 A heartbeat run carries no storage boundary, and stops executing in an administrator's personal files home
- [x] 6.8 Containers sized and limited for more than one concurrent run, and a defined reset between runs sharing a container (ADR-0057's accepted risk)

### Phase 7 — Build: hq's disk access
**Delivers:** hq reads and writes nothing under an Execution Site's root — what only hq reads moves to
hq's own storage, and what the site owns is asked for over the channel.
**Starts when:** Phase 5 is merged — the transport carries the file methods.
**Execution plan:** yes — many small moves, each with its own access rule.
**Records:** the design in spec §6.5

- [x] 7.2 hq's own storage holds task attachments, agent avatars and covers, the voice cache, org board templates and the org library's skill sources
- [x] 7.3 A task attachment is served behind sign-in and the ownership rule, with its own type rather than as text
- [x] 7.4 The avatar route requires sign-in and serves from hq's storage
- [x] 7.5 Browsing and reading a location's files crosses the channel, with entitlement checked by hq before it asks
- [x] 7.6 Seeding a new location's files crosses the channel — hq asks the site to create them
- [x] 7.7 Connecting a repository and reading its state run on the site, where git belongs
- [x] 7.8 ~~The kernel's bootstrap files are seeded where the kernel reads them~~ — struck: nothing seeds them. The writer was deleted before this phase; what survived was a read path with no writer, removed with the route that served it
- [x] 7.9 Confirmed that no client outside this repository calls the `/agents/:id/config/*` routes or the directory-picker queries
- [x] 7.10 Dead paths removed — the directory picker, the callerless routes, the duplicated disk helpers, `getLocationCwd`, `getScratchDir`, and the workforce proposal file nothing reads

### Phase 8 — Build: authority and ownership checks
**Delivers:** a run carries its boundary's authority and never a union; every write path checks
entitlement to the boundary that owns the resource; credentials belong to boundaries and are encrypted
at rest.
**Starts when:** Phases 4 and 6 are merged — the checks need membership data and a settled boundary.
**Execution plan:** yes — a repeated change across many operations, where a missed one is an exposure.
**Records:** [ADR-0060](../../adr/adr-0060-authority-comes-from-the-boundary.md)

- [x] 8.2 A run's capability carries the boundary's authority; a person-invoked run in a project stops carrying the person's role
- [x] 8.3 The one location access rule checks project membership, not merely that the project exists — it gates storage listing and reading, a location's repository state, and a session's primary location — **done in Phase 4**, which introduced the access level the rule reads
- [x] 8.3a Every server write path resolves its resource's boundary and checks entitlement — projects, boards, tasks, comments, skills, sessions, agent voice
- [x] 8.3b A private project's **contents** follow its visibility: `getBoards`, `getBoard`, `getTasks`, `getTask`, `getTaskByKey`, `getTaskComments`, `getTaskAttachments`, `getBacklogTasks`, `getAllBoards` and `getAllTasks` check membership, and the dashboard snapshot stops pushing a project a person may not see. Phase 4 hid the project row; these siblings still return its tasks and boards to anyone signed in
- [x] 8.4 The GitHub Operations routes check that the boundary owns the attachment
- [x] 8.5 The kill switch stays org-wide and is gated to the org admin
- [x] 8.6 Model access is supplied per run: an API key belongs to the org or a boundary; a subscription login belongs to one person, is usable only by that person's own runs, and is used only after they accept the provider's terms
- [x] 8.6a A refreshed subscription token reaches hq rather than a site's disk, and a boundary with no usable credential fails its run with a stated reason (§6.3 open points)
- [x] 8.7 The per-agent credential directory and its write-back are removed; `agents/<handle>/` holds nothing
- [x] 8.8 `Provider.apiKey` and the subscription credential encrypted at rest with the existing helper

### Phase 9 — Build: preview and reads across sites
**Delivers:** hq starts no containers; a browser reaching only hq can open a preview running on a site
that accepts no inbound connections; and with several sites registered, hq's combined views cover
every one of them and name any that did not answer.
**Starts when:** Phases 6 and 7 are merged.
**Execution plan:** yes — a tunnel, a proxy and a set of combined reads.
**Records:** [ADR-0063](../../adr/adr-0063-preview-traffic-crosses-on-its-own-transport.md) ·
the design in spec §6.7

- [x] 9.2 A preview runs as a process inside the boundary's own container, and holds that container against idle teardown
- [x] 9.3 A site opens a preview transport to hq; hq proxies a browser into it, with the relay separable from the application server, and a preview's address unguessable and expiring with the session. The opt-in direct path (§6.6) is **not built here** — it is taken only against a measured bottleneck
- [x] 9.4 The onboarding runtime check asks the site; voice phrase generation becomes a model call; hq starts no containers at all
- [x] 9.5 Combined reads — dashboard, activity, storage, runs — ask every registered, unrevoked, compatible site and merge, naming any that did not answer and why
- [x] 9.5a A combined read has a stated wait before a site counts as not answering, and a merged feed pages by a cursor per site rather than one offset (§6.7 open points)
- [x] 9.6 Products and Programs pages offer the registered sites with their real status, and new work is placed on the site chosen

### Phase 10 — Credential rotation
**Delivers:** a site's control-channel credential rotates without the site re-registering;
`SITE_ADMIN_KEY` works only as the ruling decides; and the invite rate limit holds across
restarts and instances, counting requests by the rule the design sets.
**Starts when:** Phase 1 is merged — revocation takes effect there, and rotation builds on it.
**Execution plan:** decided at 10.3 — the build cannot be broken down before the design settles.

- [x] 10.2 Design settled in spec §6.8 on the phase branch: how the credential rotates, whether it gains a lifetime, whether `SITE_ADMIN_KEY` works only at bootstrap, and which requests count toward the invite rate limit
- [x] 10.3 Build tasks written into this breakdown and the execution-plan call made — recorded as a deviation
- [x] 10.3a Restrict `SITE_ADMIN_KEY` to bootstrap state only
- [x] 10.3b DB-backed rate limiter counting every request and `trust proxy` configured
- [x] 10.3c HQ rotation API `POST /api/v1/sites/rotate-credential`
- [x] 10.3d Site Wasp action and UI button to trigger rotation and reconnect
- [x] 10.4 ADR-0044 and ADR-0040 checked against the design

### Phase 11 — Operator console authentication
**Delivers:** a site's operator console refuses anyone not entitled to register or operate the site,
from the network as well as locally.
**Starts when:** Phase 1 is merged.
**Execution plan:** written for the phase and decided at 11.3; the decisions it settled are ADR-0064 (registration by consent) and ADR-0065 (no operator page on the site).

- [x] 11.2 Design settled in spec §6.9 on the phase branch: who may use a site's console, and how the site knows — recorded as ADR-0064 and ADR-0065
- [x] 11.3 Build tasks written into this breakdown and the execution-plan call made — recorded as a deviation
- [x] 11.3a hq issues and redeems device approvals: a site asks for a code and polls for its credential, both unauthenticated and throttled per address; an admin approves or denies a code on an approval page showing the site's name, host and connecting address; codes expire after 15 minutes and are stored hashed
- [x] 11.3b The site registers by device approval, over a control socket on the machine that the `agenthix-site` command drives — `register <hq-url>`, `status`, `unregister`; the site keeps its last connection error so `status` can say why it is not connected
- [x] 11.3c A site that unregisters tells hq it is leaving with its current credential, and hq takes it out as it does on revoke
- [x] 11.3d Rotating a site's credential is triggered from hq's Execution Sites page, over a new channel method; the protocol takes a minor version
- [x] 11.3e The site has no operator page: the status page, its query and both actions are removed, and the comments claiming a localhost bind are corrected
- [x] 11.3f hq's Execution Sites page no longer mints registration tokens; redeeming an already-approved token at boot stays, for machines hq creates
- [x] 11.3g The repository context file and the site's environment example describe registering with the command

### Phase 12 — The deployment shape
**Delivers:** the site has its own image and deploy path, and a site on another machine registers
with hq and completes a chat and a task run.
**Starts when:** Phases 7, 9 and 11 are merged — hq must stand alone, and a site's console must be
safe to expose, before a site is deployed apart.
**Execution plan:** written for the phase and decided at 12.3; the decisions it settled are ADR-0066, ADR-0067, ADR-0068 and ADR-0069.

- [x] 12.2 Design settled in spec §6.10 on the phase branch: the site's image, how hq and a site deploy apart, how a site is configured to register — recorded as ADR-0066 to ADR-0069
- [x] 12.3 Build tasks written into this breakdown and the execution-plan call made — recorded as a deviation
- [x] 12.3a Each agent container runs on its own network, one per storage boundary, shared only with the site: created and removed with the container, given a small address block from a configurable private range, and swept with leftover containers. The address agents use to reach the site is its own setting
- [x] 12.3b The site has one data-folder setting, mounted at the same path inside and outside its container; `AGENT_SITE_PATH` is removed, and the site refuses to start without `SITE_ROOT`
- [x] 12.3c The site's image: built inside Docker from a pinned Wasp in an Intel builder stage, server only, with `agenthix-site` on its path and its control socket at a path only inside the container; a site whose socket path is too long refuses to start
- [x] 12.3d The agent image and its git-credential helper move to `site/`, and the site's compose file builds them
- [x] 12.3e Registering is hardened: the command refuses a remote `http://` hq; the site no longer sends its own address and the approval page no longer shows one; the approval page separates what the site claims from what hq observed
- [x] 12.3f hq's images: the server built inside Docker from a pinned Wasp with nothing for execution in it — no Docker or Claude Code tools, no socket, no site folder, and no start-up check for `AGENT_SITE_PATH` or `DOCKER_GID`; hq-web a Caddy image built with the machine's address that serves the browser app and forwards every server path, the site channel and content transport included
- [x] 12.3g The number of proxies hq trusts is one setting, applied to hq-web and hq-server alike
- [x] 12.3h Compose files: hq's and the site's, each with an environment example; the optional front door as its own stack, carrying its whole-machine warning in its compose file, its configuration and the guide; running both on one machine as two separate projects, one command each. The environment examples describe `HQ_URL` and `HQ_REGISTRATION_TOKEN` as the path for machines hq creates
- [x] 12.3i nginx and its configurations, every Traefik reference, the LAN and server compose overrides, and hq's image-building and deployment scripts are removed; the deployment of our own server moves out of this repository
- [x] 12.3j A deployment guide — the three machine arrangements, a front-door snippet for Traefik, Caddy and nginx with the trusted-proxy count each needs, registering a site, and what a machine needs — and the repository context file's instructions for running it
- [x] 12.3k Proven on one machine: registration, a chat run and network isolation confirmed live. The task run was blocked on a project or org credential to run with (close-out register, R-136, since built in Phase 13); it and the two-machine leg were not done in this unit and are carried with 13.7 by the two-machine walkthrough issue
- [x] 12.4 Site's server environment example documents `HQ_URL` and `HQ_REGISTRATION_TOKEN`, and the site refuses to boot without `SITE_ROOT` — done by 12.3b and 12.3h; the token path is now only for machines hq creates
- [x] 12.5 The unused VPS nginx configuration and the script that pushes it are removed or brought in line — done by 12.3i

### Phase 13 — Close-out
**Delivers:** the unit is accepted and closed, with every open item fixed or raised as its own issue,
and the split's own unit closed.
**Starts when:** Phases 1–12 are merged.
**Execution plan:** a log of numbered passes, one section per pass, each written as the pass starts —
this phase is an open-ended loop, so a plan written up front would be verdicts before the evidence. A
pass that builds something gets its own steps.

Three stages, in order. Each loops until it has nothing left, and the next does not start before it
does — recorded as a deviation.

**Stage 1 is worked in passes**, numbered 1, 2, 3 and open-ended. A pass takes the open register items
it will address and says why they belong together, does any design it needs by correcting the spec in
place, builds, walks the result, and closes what it can; the next pass starts from what is left. Build
tasks a pass creates continue this phase's numbering.

**Stage 1 — walkthrough and feedback, until nothing is left open**

- [x] 13.7 ~~The walkthrough, with hq and a site on separate machines — every item in the walkthrough register below~~ — the owner checked the credential build, Sign in with Claude and the hq-and-site pair in the running app as each was built, and what those checks and the reviews turned up was fixed or raised; the walk on two separate machines, with a task run, was not done in this unit and is carried by the two-machine walkthrough issue, which points at the walkthrough register below
- [x] 13.5 Every open item triaged as the loop ran — each of the register's rows is closed as fixed, moot or not a fault, or raised as its own issue, and each critical one is fixed or marked **Blocks release**
- [x] 13.5a The design's remaining open points triaged with them — whether a reader class is wanted (§6.3) is raised with the design of the organisation roles; a departed person's retained storage having no one who may act in it (§6.4) is raised as its own issue; whether the dashboard reads pushed summaries (§6.7) is raised as its own issue

- [x] 13.9 Model credentials, per boundary: the owner enum and migration, so an org can hold a subscription (R-172)
- [x] 13.10 A run's credential is resolved per boundary — org, person, project — with the single-person rule and the runtime restriction (R-172)
- [x] 13.11 A run with no usable credential is refused with an error that says what to do (R-172)
- [x] 13.12 Credentials can be set, read and removed at every boundary, with the org's under the admin role (R-172)
- [x] 13.13 Admins see a persistent banner while shared runs have no usable credential (R-174)
- [x] 13.14 One settings component at the profile, the project and a new org "Model Access" page (R-172)
- [x] 13.15 Full regression for the credential build
- [x] 13.16 "Sign in with Claude", the wire: the login methods and the protocol version they need (R-173)
- [x] 13.17 "Sign in with Claude", the site: a throwaway container runs the login, takes the pasted code, hands back the credential, and is always cleaned up (R-173)
- [x] 13.18 "Sign in with Claude", hq: start, finish and store a login; the paste path is removed and the expiry is read as the number the real file holds (R-173, R-112)
- [x] 13.19 "Sign in with Claude", the settings flow replaces the paste form (R-173, R-139)
- [x] 13.20 Full regression, then the real login with the user in the running app (R-173)
- [x] 13.21 hq has an organisation from its first boot (R-182)
- [x] 13.22 hq's side of the pair: a default site recorded from a shared secret, which cannot be revoked, left or rotated (R-183)
- [x] 13.23 The site's side of the pair: it connects with the secret and no registration, and the secret is set up in both environments (R-183)
- [x] 13.24 A list of Execution Sites that any signed-in person can view (R-184)
- [x] 13.25 An admin-only "Connect a site" screen: sites waiting for approval, and instructions (R-185)
- [x] 13.26 Full regression, then walking it with the user in the running app; deployment guide, context file and decision record updated

Stage 1 ends when every open item and every piece of walkthrough feedback is fixed or raised as an issue.

**Stage 2 — QA contract catch-up**

- [x] 13.2 The QA contract brought into line with what this unit removed — scenarios and domain files that describe removed behaviour retired or corrected (`72a8016`). The full QA audit moved out of this unit to a unit of its own, run before any release (**Blocks release**)
- [x] 13.3 Scenario SC-288 retired — part of the contract catch-up
- [x] 13.4 QA contract files that still say `site` but hold hq's contract renamed — part of the contract catch-up; `docs/qa/scenarios/hq.md` and `docs/qa/stories/hq.md` hold hq's, and `docs/qa/scenarios/site.md` is the site's own

**Stage 3 — close**

- [x] 13.6 The split's unit closed — its plan corrected to what merged and frozen, and its non-critical leftovers each closed by this unit or raised as an issue
- [x] 13.8 This unit closed — decision records noted, plan frozen, stale documents updated, `delivery.md` appended; the roadmap's planning cycle left to its owner

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | Tasks ran one at a time, not in parallel as the execution plan proposed | Parallel implementers in one checkout collide; one agent committing at a time kept each commit to its own task |
| 1 | Task 1.10's migration was generated with `prisma migrate diff`, checked by hand and applied with `prisma migrate deploy`, not `wasp db migrate-dev` | Every `wasp db migrate-dev` attempt stopped at Wasp's database check with "Can not connect to database", before Prisma's prompt; the user chose this path |
| 1 | Tasks 1.17–1.18 became keeping each site's link status current on the Execution Sites page; the credential-health badge was dropped | The user decided the badge is the site's link to hq. Who owns an agent's Claude login is undesigned and now a roadmap Open question under Run security boundary |
| 1 | A 7.0 site paired with a 7.1 hq leaves new sessions untitled | Accepted: titles now have one writer, the site, and hq and site ship and version together, so the pairing exists only mid-upgrade |
| 1 | Task 1.18a added from the final review: terminal frames carry the title as site's row holds it, and revoking a site fails its held and running tasks | Closing the channel on revoke stranded running tasks — a regression this phase introduced — and repeating the dispatch-time title reverted renames |
| 1 | Security gaps found outside spec §4 went to the Run security boundary milestone as four issues — write-path entitlement, the run list's visibility, real-path checks on file reads and terminal-frame archiving — each marked Blocks release; the session-owner lookup went to Phase 2 | The user's decision: they belong to that design, and the close-out rule does not let a deferred critical item ship |
| 1 | Tasks 1.20–1.21 added | This phase made ADR-0051's residual and `site-auth.md` untrue, and the user ruled it responsible for correcting them |
| — | The run security boundary joined this unit, and the phases were re-cut from eight to ten: the second part of the no-design work became Phase 2, the seven interlocked questions one design phase (3) with three build phases (4–6), and rotation, console authentication, deployment and close-out became Phases 7–10 | The user's decision: the two milestones are too closely related to plan apart. Designed one question per phase, hq's disk access, placement and preview would have been built against a storage model the security design replaces |
| 1 | Phase 1's move of those four issues to the Run security boundary milestone now lands them back in this unit; all but write-path entitlement are fixed in Phase 2 with the session-owner lookup, and write-path entitlement moves to what is now Phase 8 | That milestone is now this unit, and the Phase 2 fixes need no design |
| 3 | Task 3.4 wrote eight records, not the four the task named | The design settled more than the task anticipated. ADR-0047, 0048 and 0049 are superseded by 0056, 0058 and 0057; five new records carry the package, authority, grouping, membership and preview decisions. ADR-0051 is confirmed rather than amended — preview gets its own transport precisely so the channel keeps its typed-events rule |
| 3 | The version rule in spec §6.5 cites ADR-0046 instead of deciding it | ADR-0046 already settled major/minor compatibility for the protocol in August. What §6.5 adds is that the package format follows the same rule, which is a citation rather than a decision |
| 3 | The three build phases became six, and the phases after them renumbered from 7–10 to 10–13 | The design settled more than the cut anticipated. The ownership model is a schema change with a membership surface that everything downstream checks against; packages need a transport that hq's disk access also uses; and preview needs a tunnel. Merging them back would produce phases that only merge at the end, which is how the split unit failed |
| 2 | Phase 2 was raised and branched as hq's disk access, then became the second part of the no-design work; hq's disk access moved into Phase 3 and its build into Phase 4 | Its inventory showed agent identity files and skills depend on the storage and package design, and that design joined this unit |
| 2 | The GitHub Operations routes' missing location access check, found by the final review, went to the joint design (spec §5.3) rather than a Phase 2 task | The user's decision: whether GitHub access belongs to the org, a project or a person is undecided, so the right check depends on the authority design |
| 2 | Phase 2's scope frozen after 2.14–2.18; the holes found while drafting them recorded in the close-out register by kind | Every pass over the code found more instances of the same four kinds of mistake, with no natural end. The user's decision: freeze, and record |
| 2 | Tasks 2.14–2.18 added, and the final check renumbered 2.19 | Five more holes of the same kinds were found while planning this phase, each with an obvious fix. The user's decision: they were found, so they are fixed now |
| 2 | Task 2.12, the invite rate limit, moved to credential rotation (spec §5.8, now Phase 10) | Planning showed the durable counter needs a rule for which requests count, which trades security against friction. The user's rule: an item whose fix is not obvious belongs in the design; §5.8 already holds the `SITE_ADMIN_KEY` ruling, the other half of who can obtain an account through the invite path |
| 2 | Task 2.7, git in a location, moved to the joint design (spec §5.5) and its build | Planning showed no set of git settings stops everything a location's configuration can do, so the fix needs design. The user's rule: an item whose fix is not obvious belongs in the design |
| 4 | No data migration: both databases are reset and the site's storage root cleared, rather than product- and programme-owned workspaces being moved under a project as task 4.5 said | The user's decision, 2026-09-16: the system is in early development, so existing storage is discarded. ADR-0062's rename-before-create ordering still binds any install with data; here both tables start empty, so it is satisfied trivially |
| 4 | `create_project`, `create_product` and `update_product` raised to `ADMIN`, departing from spec §6.4's sentence that the existing floors "are already right" | The user's ruling, 2026-09-16: creating a project shapes the org's structure, as they said during the design. §6.4's org-admin column already reads "products and programmes" |
| 4 | `gitGrantService` still keys the repository credential on the agent's assignment, now `ProjectAgent` | ADR-0062 wants it keyed on the run's boundary, which needs the capability Phase 8 builds. Renaming it without that would leave the gate open. Carried to Phase 8 |
| 4 | `createProject` takes an optional creator and appoints the org's admin where there is none | Three paths create a project with nobody behind them — onboarding's seed, the workforce assembly board, and a static-MCP-key caller. Threading a person through all three would be invention; appointing the org's admin keeps "a project always has an admin" true in every real case |
| 4 | The database migration moved from the first task of the phase to the last | `wasp db reset` and `wasp db migrate-dev` compile the Wasp project before they reach the database, so neither can run while the code still references what the schema has dropped. The schema leads, the code follows, the database moves last |
| 5 | Phase 5 split into three — 5 the content transport, 5b packages and delivery, 5c memory held by hq | The user's decision, 2026-09-16, after the phase's inventories: its fifteen tasks covered three subsystems that barely touch, and only the package work is indivisible. The transport merges alone and the rest needs it; memory rides the dispatch context and needs neither. Left whole, nothing would have merged until all fifteen landed — which the plan's own row above says is how the split unit failed. Lettered rather than renumbered so Phases 6–13 and every cross-reference stand |
| 4 | A regression shipped and was fixed after the merge: site's dispatch validator still required `mounts.products` | Phase 4 removed the field from core, hq and hq's tests and left site's zod validator behind. It is `.strict()`-parsed and the field was required, so every `run.dispatch` failed validation — no agent could run. Both apps type-checked clean, because site's validator is a hand-written runtime mirror of core's type with nothing relating the two, and the one site-side dispatch test hand-built the old shape. Found by a Phase 5 inventory reading the dispatch path end to end; fixed on `main` with a drift test that pins the validator to core's type |
| 4 | Both migrations were generated with `prisma migrate diff` and applied with `migrate deploy`, not `wasp db migrate-dev` | The same path Phase 1 task 1.10 took, for the same reason: removing the `product` and `program` enum values needs a confirmation Prisma will not take from a non-TTY, and piping `y` fails Wasp's own database check before Prisma's prompt is reached. The SQL was read before it was applied, and `prisma migrate diff` reports no difference from either schema afterwards |
| 4 | The migration alters `ProjectMember` in place rather than renaming it to `ProjectAgent` and creating a new table | What `prisma migrate diff` generates from the schema. Equivalent here because the tables are empty; ADR-0062's ordering rule is about data, and the wipe removed it |
| 4 | The access-level control, the project-role control and hiding the filing pickers were built, though no task named them | Found by review. Without them `PRIVATE` was unreachable through the product, no admin could be appointed, and every rename was an org-admin act that locked a project admin out of their own settings — the server half was complete and the product half was not |
| 4 | The product wiki e2e spec was deleted | It drove a product wiki tab that never existed and now cannot: a product owns nothing. Its `@SC-199` scenario needs retiring at the unit's close |
| 4 | Task 8.3 was done here rather than in Phase 8 | It is the access level's own meaning, and the access level is this phase's. Its sibling half — a private project's boards and tasks — is task 8.3b, added so the remaining gap is tracked rather than assumed |
| 4 | Four storage paths gained the location access rule they never had: creating and deleting a workspace, reading one, and reading its access policy | Found by review. They sit in the same two files as paths that do check, and without them any signed-in person could destroy a project's workspace |
| 4 | `updateProject` now writes named fields only | Found by review. A params type is compile-time, and Wasp hands an action whatever the client posted, so the spread let `accessLevel` be written straight past the narrower gate `setProjectAccessLevel` applies to it |
| 4 | `addProjectMember` no longer writes a role when the person is already a member | Found by review. The upsert's update branch demoted an existing admin to the MEMBER default, past both the gate and the last-admin check — and could leave a project with none |
| 4 | Listing and reading a project check entitlement, which task 4.4 did not name | §6.4 says a non-member of a private project "cannot see the project". The access level is this phase's, so enforcing what it means is too; without it, private would have meant only "cannot write" |
| 4 | `updateProject` gates filing and the project's own fields separately | Requiring both of every call blocked the person filing is for: an org admin does not implicitly reach a private project, so demanding project admin as well would have made filing one impossible |
| 4 | `deleteProject` gained a project-admin gate the task list did not name | It was reachable by any signed-in person, which is the same hole §6.4 closes for every other project act |
| 5 | Only hq opens content streams; the site serves them from a closed list of named methods, and that list is empty in production | Phase 5b's delivery and Phase 7's disk access both have hq asking a site for something, so nothing needs the other direction. The first entry lands with the first consumer, in 5b, which therefore depends on this transport's shape but not on any method it ships |
| 5 | hq authenticates a connecting site before checking its protocol version, and refuses a mismatch with HTTP 426 naming the version it requires | The plan described the old order: version first, then a 400 with nobody identified, so hq had no row to mark. Authenticating first is what lets the mismatch be recorded against the site; 426 is the status HTTP defines for "upgrade and try again" |
| 5 | The protocol version went to 7.2 | The content transport adds a path and frames a 7.1 hq does not know. A minor bump is additive under ADR-0046, so a 7.1 site still connects |
| 5 | The control channel changed in behaviour, though the execution plan said it would not: its open and close handlers now ignore a superseded socket, and it terminates a socket that has been silent for 75 seconds | Found by review. Two overlapping boot paths could each open a socket and the stale one's close would mark the live link down; and a link that dies without closing — a laptop sleeping, NAT state dropped — left the site believing it was connected forever. Fixing the watchdog on the content connection only would have left the control channel with the same fault |
| 5 | The content connection never decides a site's status, on either side | A version mismatch on the content connection is only logged on the site, and hq's status comes from the control channel alone. Otherwise the two connections could disagree and the second would overwrite the first |
| 5 | A reset during a connecting client's upgrade check no longer crashes hq, on the control channel, the content transport and the preview route | Found by the final review. Pre-existing on the control channel and preview; this phase moved the check into shared code and opened a second path to it, and it needed no credential to trigger |
| 5 | A queued task on a site with a version mismatch is still held with the reason "held for reconnect" | The review asked for the stored reason to name the upgrade. That reason is also the key four code paths match on to find and release held tasks, so changing it would strand them. The wording is recorded as an open item instead |
| 5b | hq delivers a version a site lacks before it dispatches; a site never fetches | The content transport lets only hq open streams (ADR-0051, ADR-0063). hq asks the site which versions it lacks over the control channel and streams each before the dispatch, resume or prompt preview that needs it |
| 5b | Packages are held in hq's own database, versions are whole numbers (`scout@7`), and a site verifies a version by its sha256 digest with no signature | The shipped library is under 500 KB, so a database needs no new storage and is already backed up. A version comes from saving an edit, with no intent to say whether it is major or minor. hq is the authority and delivers over the site's authenticated connection, so a signature would add keys for no party that is not already trusted |
| 5b | No package directory is bound into a container | Nothing in a container would read it: instructions, heartbeat and `ORG.md` go into the prompt the site builds, and skills are copied per run. So a running container never sees a new version, which is what §6.2's open point asked |
| 5b | The protocol went to 8.0, not a minor | A site can no longer run without the package references a dispatch carries, so the change breaks both directions. ADR-0046's major rule is the mechanism for that, and Phase 5 made a major mismatch a visible state that holds tasks. hq and site ship together |
| 5b | Turning an agent's heartbeat on or off is not versioned; its interval is | Stopping an agent is the kill switch (§6.4), which must not need an org admin |
| 5b | A boundary's model override beats a model chosen for a session, and may only be the same price or cheaper, and only for the Claude SDK runtime | §6.2: a person working in a project gets the project's agent, and an override "cannot grant more than the agent has". An override a session could undo would not narrow anything |
| 5b | The `Agent` row keeps its behaviour columns, written only when a version is published | Capability minting, dispatch, the heartbeat scheduler and the UI read them. §6.2 says the record holds identity only; dropping them is carried to Phase 8 |
| 5b | The kernel's shipped files apply only until a person first publishes the kernel | Applied on every boot, they would overwrite an admin's edits |
| 5b | `ORG.md` is put into task and heartbeat prompts instead of being pointed at | `/shared/org/ORG.md` existed only inside a container, and the mount is gone |
| 5b | `ONBOARDING_ADMIN.md` became the onboarding task's description and chat's opening prompt, and no longer tells the kernel to write its own profile | An agent cannot publish itself (§6.2) |
| 5b | "A preset" struck from 5b.12 | Presets are avatar and cover images — identity, not package content |
| 5b | Creating an agent from a template, a workforce template or an import sets its heartbeat switch from the template; a resumed run records the versions it actually loads | 24 shipped agents are designed to wake on their own. A resume follows a person's approval and loads the latest version; its record says so |
| 5b | The project-wide skill install target was removed | Nothing sent it, and a skill for one project now lives in that project's files beside the agent it is for |
| 5b | Existing agents were not migrated to packages | Both databases were wiped in Phase 4 by the user's decision; every path that creates an agent now publishes its first version |
| 5b | There was no site image to strip; the steps that copied assets onto a site's disk were in hq's deploy scripts and dev start script, and those were removed | `site/` has no image or deploy pipeline of its own yet (Phase 12) |
| 5b | A site does not evict a version used or delivered in the last five minutes | Found by review: a version hq had just confirmed or sent could be evicted before the run that needs it recorded it. The cache may exceed its size cap for up to five minutes |
| 5b | Integration suites were run at every task, and a Phase 4 integration test counting people where agents are now assigned was fixed | A task's asset-path change broke an integration test the unit run excludes, unseen for four tasks. The Phase 4 test had been failing on `main` since that phase |
| 5b | Boot refuses to publish a package whose asset folder is missing | Found by review: a misplaced assets folder published empty platform and kernel versions and every run silently lost its built-in skills |
| 2 | hq's bundled assets were re-tracked on the phase branch before the phase was re-scoped | The root `.gitignore` rule for a local link had matched `hq/assets` since the submodules became plain directories, so a clone had no templates, skills, presets or onboarding files |
| 5c | Memory is a list of short items with caps, not a free-form document | Promotion moves one thing, and a person curates a list; a document has no unit to promote and no cap to enforce |
| 5c | What is on disk is set aside at boot, never imported — the plan said "a one-time move of what is on disk" | An old partition holds free-form model-written text of unbounded size and the new store holds short curated items under a cap; importing unreviewed would push arbitrary text into every future run's prompt with nobody at boot to accept it. The files stay readable, so anything worth keeping can be re-added |
| 5c | The boot sweep also covers the pre-ADR-0048 location inside the agent's workspace, which the plan did not name | That directory mounts read-write into every run, so a partition left there is one person's memory readable by every other run of that agent — the exposure ADR-0048 was cut for. The migration that used to drain it is deleted in the same phase |
| 5c | The migration ran mid-phase rather than at the end as planned | A review proved an integration test was green only because a caught error swallowed "the table does not exist", so the real read was exercised by nothing. Leaving it would have hidden a dead path for seven more tasks |
| 5c | The task that was to run the migration became the tests only a real database can carry | The migration had already landed. Those tests then found two real defects in shipped code: a recovery path reading a transaction the database had already aborted, and the same exposure one function along |
| 5c | An agent may forget only its own items; the shared layer and another agent's are refused | Not in the plan. Without it an agent could delete what every other agent reads, which spec §6.1 gives to the person alone |
| 5c | Two citations to a gitignored plan were removed from files this phase never touched | Left by an earlier phase. The rule is repository-wide, they were one-line comment edits, and restoring known-dead references to a public repository to keep a diff tidy is the wrong trade |
| 5c | `@SC-329` and `@SC-330` are dropped with the mount tests that carried them, and nothing replaces them | They cite the mechanism this phase removes. Rewriting the scenario contract against finished behaviour belongs to the unit's QA audit at close-out, not to a build phase |
| 5c | `buildContext` moved to its own module before anything was added to it | `dispatchService.ts` was at 491 lines against the repository's 500-line stop, and this phase adds to that function |
| 7 | Task 7.8 struck: nothing seeds the kernel's bootstrap files | The service that wrote them was deleted in an earlier commit, and the module that resolved the path records it. What survived was the mirror image — a read path with no writer, serving a directory a later phase had already moved into hq's database and which the site empties at every boot. It went with the route in 7.10 rather than being re-seeded |
| 7 | hq's workspace `mkdir` moved onto the channel instead of being deleted as 7.10 said | It is not dead. The site creates a workspace directory only when a container starts, so deleting hq's call would leave a new workspace with no directory, and every read of it failing, until something ran in it |
| 7 | Task 7.2's avatars and covers were already done | Phase 6 moved them to hq's own storage when it removed the agent's private directory. Only the sign-in half of 7.4 was outstanding |
| 7 | The attachment halves of §8.3b — `getTaskAttachments` and `uploadTaskAttachment` — were done here rather than in Phase 8 | 7.3's own test asserts that a forbidden attachment is indistinguishable from an absent one, and the listing operation handed out the inventory that makes that assertion false. A later phase finding its work already done costs nothing; a false assertion sitting in the suite until then costs more |
| 7 | A sixth channel method, `location.readArtefact`, beyond the five 7.5 implies | An artefact set lives beside a location's `files/` rather than inside it, so no location reference can name one. Adding a field to that shape would have made every caller of every location method carry a dimension one read uses, days before the shape was consolidated into one declaration |
| 7 | An `attach_file` entitlement fix, found by the final review and not in any task | This phase put the browser's attachment routes behind a project-membership check, which made false the stated justification for the control plane's own bypass — that the person could reach the same data in the browser. The phase invalidated an existing authorization decision in a file it also edited, and carrying the fix across was its responsibility |
| 7 | The two concept documents 7.10 did not name, plus four more, corrected here | They describe this phase's own subject: where content lives, which route serves it, and under what rule. The phase that changes the behaviour is the cheapest place to correct what describes it |
| 6 | The protocol went to **9.0**, a major bump, not the minor the phase planned | Three required fields left the wire. ADR-0046 admits only additions under a minor, and its own risks section says a breaking change mislabelled as a minor "fails silently instead of loudly". A major refuses an older site at the handshake with a reason an operator can read, instead of failing every dispatch on a schema parse behind a healthy-looking connection |
| 6 | Two minimum-version gates were reshaped from a bare minor to a full `major.minor`, and a third — persisted in the database — was found and worked around | A minimum held as a bare minor cannot survive a major bump. The memory gate would have withheld memory from every site, silently. A package row stores its floor as a bare minor with no major beside it, so a row written under 8.x reads as a demand on 9.x; the interim fix pins the major as a literal and the column change is raised as its own issue |
| 6 | The mount set became a function of the owner alone, so a task run mounts the project's whole `tasks/` root rather than its own task directory | The container is keyed by the boundary, so a set that varied per run would destroy and recreate the container on every alternation between a chat and a task. Spec §6.1's "What this keeps" still says a task run mounts "the task's own directory" — **correct the sentence at close-out**. The consequence: every run in a project, including a chat with write tools, can now read and write every task's working files. Inside one owner, so the rule holds, but wider than the design states |
| 6 | The task working directory lost its readable key — a run sees the task's id where it saw something like `WEB-42` | Binding one task's directory is the per-run mount this design removes. Nothing depends on the readable form, and nothing carries it to the agent either: the prompt renders the id |
| 6 | The agenda became one per person per boundary rather than one per person per agent, and a task run has none | Spec §6.2 places it in the member folder, which is a boundary. A task run acts for the project, not a person — its session carries an arbitrary administrator's id as bookkeeping, and rendering that person's folder would have written their agenda from tasks they never asked for |
| 6 | A person's own agenda sits under their `files/` rather than at the root of their storage | The owner root is never mounted, so the root path would have reproduced the defect being repaired — an agenda the run cannot reach |
| 6 | An agent's avatar and cover moved to hq's own storage, pulled forward from Phase 7 | They were the only live content left under the agent's private directory, and this phase removes it |
| 6 | Preview and the non-SDK runtime's file tools were repointed at the run's boundary, and the preview container is now named by what it mounts | Both read the agent's workspace, which this phase deletes. Naming preview by agent alone became a cross-boundary read once its contents became per boundary: a second preview by one agent in another project recreated the same container against the other project's files while the first token was still live |
| 6 | Skills are staged inside the agent's Claude credential home | They were staged under the agent's workspace and reached through that bind; removing it would have lost every skill on every run, silently. Phase 8 must relocate the staging as well as the credential, and copying into the container rather than binding is the better destination |
| 6 | The agent's Claude credential directory stays, so the phase does not achieve §6.1's rule that nothing agent-scoped is mounted | Moving it needs hq to hold the credential and supply it per run, including a mid-run refresh — Phase 8's task 8.7. It is the answer to the open item asking whether that mount would be gone when this phase closed: it is not, by design |
| 6 | No QA contract work, and several scenarios now describe removed behaviour | Contracts are written against finished behaviour at the unit's close. Listed in the close-out register so the audit has them |
| 8 | A chat inside a project no longer carries the person's org role, so an org admin can no longer reach an org-escaping tool through an agent in a project | ADR-0060: a run acts with the authority of the one boundary it is for. A chat in a project acts as the project, and a project has no org authority; the same chat started from the person's own storage still carries their role. The design working rather than a fault — and it will read as a regression to anyone who relied on the old reach, which is why it leads the walkthrough |
| 8 | The organisation's model key stays a `Provider` row — only a boundary's own key and a person's subscription went to the new table | The org's key belongs to no boundary, and moving it would have rewritten every LLM and voice read for nothing. Task 8.8's encryption was applied to the column where it already is, with a boot pass that rewrites any row still in the clear and skips silently when no master key is set |
| 8 | Invite tokens were left in the clear, though the plaintext-secrets issue names them | The invite path's issuance rules change in the credential-rotation phase. Encrypting the shape that is about to be replaced hardens nothing, and that issue stays open for it |
| 8 | The Claude home is keyed by the boundary and bound, not copied into the container as Phase 6 proposed | Copying per run varies the mount set per run, which reintroduces the container eviction ADR-0057 exists to kill. The credential is written into the boundary's home before each run instead, and removed when the run ends — the lifetime property without a per-run mount |
| 8 | A run's credential is cleared on arrival when the run was granted none, and removed when the run ends | Found by review. Write-or-leave meant a person who deleted their subscription still had the document sitting read-write in their next run's home: hq revoked and the disk did not. A credential must not outlive the authority that put it there, which is the property this phase exists to establish |
| 8 | The mid-run refresh's sending half shipped one task later than planned | The per-agent home it was to read holds the site's shared operator login, not the run's credential, so the planned path would have sent one machine's operator account to hq as a named person's subscription — and never transported the refresh it exists for. The event and hq's handler are correct with no sender, so they shipped, and the sender waited for the boundary home |
| 8 | The credential probe is gated on the Claude SDK runtime | A native run reaches its providers through their own environment keys and never reads a Claude Code OAuth document. Probing it would refuse runs that work — the loud-failure rule biting a case it was not meant for |
| 8 | Four more session operations gained the project check the task list excluded — `updateSession`, `archiveSession`, `triggerAgentRun` and `cancelAgentRun` | The exclusion rested on a task session being unreachable from the browser. The session page takes its id from the URL with no type filter, so it is reachable: the arbitrary administrator whose id the task runner stamps on the row could rename, archive, run and cancel any task session in the org, while the project's own members got 404 |
| 8 | `getActivitySession` branches on the session kind rather than calling the one entitlement helper | The direct call regressed heartbeat-session visibility that an existing scenario pins. The branch keeps task sessions on project membership, chats on the owner test and heartbeats org-wide — the same rule expressed per kind |
| 8 | A free-running heartbeat session stays stoppable and deletable org-wide | The reads list it to everyone and the interface renders Stop and Delete on every row; narrowing the writes to the arbitrary administrator whose id the runner stamped on it would have made the writes disagree with the reads. What a heartbeat's rule should be belongs with the open question of whether the heartbeat survives the storage boundary model |
| 8 | The dashboard's recent activity is filtered per viewer, with the owning project carried on each entry as a server-side-only field | Found by review. Two of the six activity kinds put a project's name or key in the summary, so a private project's identity still reached every subscriber after the snapshot itself was made per-viewer. The filter runs before the slice, so a non-member gets a filtered feed rather than a shorter one, and the id never reaches the wire |
| 8 | `createTask` and `moveTaskToStage` check the destination board as well as the task, and three sibling sweeps were constrained the same way | Found by review. A caller-supplied board id is a second resource beside the primary one, and nothing in the schema relates a task's board to its project. Hardening one consumer and leaving three neighbours with a comment explaining a hazard they ignore is how the hazard comes back |
| 8 | `sessions/queries.ts` was split at the 500-line stop; `projectService.ts` was left over it | The session queries crossed the stop inside this phase, so three dashboard queries moved to a sibling module and are re-exported. `projectService.ts` was already past it before this phase and gained fourteen lines here; splitting a 775-line file in the middle of an authorization sweep is how a check gets lost. Recorded for close-out |
| 8 | The migration was hand-curated to its additive subset rather than taken as generated | The generated migration proposed dropping the auth tables alongside the additive change. What was applied creates the enum, the table and its index and drops nothing, and the database was inspected afterwards to confirm nothing was lost. Recorded because a database change is the one place "it worked out" is not the test |
| 8 | The protocol went to 10.0 | The run's model credential rides the dispatch context and the refresh is a new frame. A site that does not carry the credential cannot run at all, so the change breaks both directions, and ADR-0046's major rule is the mechanism for that |
| 8 | The `Agent` row keeps its behaviour columns, which Phase 5b carried here | Capability minting, dispatch, the heartbeat scheduler and the interface all read them. Dropping them is a schema change with four consumers, unrelated to authority or ownership and large enough to distort this phase. It needs the user's call on whether it joins the unit's close-out or becomes its own issue |
| 8 | No QA contract work, and two scenarios now describe behaviour this phase changed | Contracts are rewritten against finished behaviour at the unit's close. One scenario asserts the ungated kill switch as known-bad and cannot pass without contradicting itself, so its single test is skipped with a comment and the evidence left in place; another's second half describes the seed-and-write-back pair this phase deleted. Both are in the close-out register for the audit |
| 8 | hq's server did not bundle at all, and the phase gate found it rather than any suite | The boot pass added with the at-rest encryption is reachable only through a dynamic `import()`, which makes it a second Rollup chunk; the generated server bundles to `output.file`, which refuses more than one, so the whole server bundle failed and hq could not start. Neither `tsc --noEmit` nor `wasp build` sees it, because `wasp build` never runs the bundle step. The module is imported statically now, with the reason recorded at the import so it is not tidied back |
| 10 | Execution plan created for the phase, breaking down 10.3a–10.3d | Settled design in spec §6.8 before building |
| 11 | The design became two decisions — registration by consent (ADR-0064) and no operator page on the site (ADR-0065) — and ADR-0064 supersedes ADR-0044's token-upfront registration. Build tasks 11.3a–11.3g written, with an execution plan written for the phase | The console question split into registration, before the site trusts any hq, and operating, after it does. A page on the site turned out to be the problem rather than something to guard, which moved rotation to hq and registration to a command on the machine. The desktop app that gives this a graphical front end is out of scope, raised as its own issue |
| 11 | Task 11 could not leave the site with zero `route`s as ADR-0065 intends: `wasp compile` refuses an app with none. One static route/page pair was added back — `SiteRootRoute` / `SiteRootPage` (`site/src/pages/SiteRootPage.tsx`) — rendering only the text "This is an Agenthix Execution Site. Manage it from hq, or with `agenthix-site` on this machine.", with no query, no action and no entity behind it | The task's own brief named this exact fallback for exactly this failure. It is not a web page in the sense ADR-0065 forecloses — no data, no operation, nothing an operator can act through — but it is a route Wasp will render, which is a gap between the decision as recorded and what Wasp 0.21.1 will compile |
| 12 | The design became four decisions — agents over a private network per storage boundary (ADR-0066), hq ending at one plain-HTTP port (ADR-0067), hq's browser app built for its address (ADR-0068), images built with only Docker (ADR-0069). The original 12.4 and 12.5 were stale; their work is folded into build tasks 12.3a–12.3k, with an execution plan written for the phase | Registration moved to a command in Phase 11, so `HQ_URL` and its token are only for machines hq creates. Wasp fixes hq's address when its browser app is built and publishes no ARM command-line build, which decided how images are built. A network per boundary closes a cross-boundary reach found while writing the design. Publishing ready-made images, automated deployment tests, moving hq to a new address, and the site leaving Wasp with the desktop app are left for later |
| 12 | 12.3k's live proof did not finish: a chat run and network isolation were proven on one machine, but no task run completed and the two-machine leg was not attempted | A task run acts as its project, and neither the project nor the org had a credential it could use — the org fallback exists but takes only an API key, and none was on hand during the walkthrough. Deferred to Phase 13 §13.7, since the two-machine leg would hit the same wall |
| 13 | The close-out runs as three stages — walkthrough and feedback until nothing is left open, then the QA audit until nothing is left open, then closing both units — rather than an audit first and one walkthrough at the end, and the first stage is worked in numbered passes inside this one phase rather than in further phases. Scenario retirement and the contract-file rename (13.3, 13.4) become part of the audit | An audit run before the walkthrough would write contracts against behaviour the walkthrough is still changing, and its findings would be triaged twice. The walkthrough is where the feedback comes from, so it goes first and loops, and the audit is the final pass over finished behaviour. Closing the split's unit (13.6) and this one (13.8) are two units but one closing step |
| 13 | Onboarding is cut to Welcome, Organisation and Done, and hq creates no Execution Site of its own — with none connected, lists show empty with a notice and actions that need a site fail with one explicit error. Provisioning a local site from hq is left as a future feature | A fresh install with no site could not finish onboarding (completing it seeded a project through a site, failed, and redirected back to the wizard), and the placeholder site hq made for itself was a ghost that offered itself in pickers and could not be reached. A person should be able to look around before setting anything up. Provisioning a site from hq needs published images and Docker access for hq, which Phase 12 removed on purpose |
| 13 | A model credential can sit at the org, person or project boundary, each holding an API key or a subscription login, and the person signs in through a login run in a throwaway container at a site. An org or project subscription is used only while the org has exactly one person; a person's own subscription works in an org of any size. Admins see a banner while shared runs have no usable credential | The org fallback took only an API key, so a single-person org on a subscription could run a chat but no task or project run, which stopped the walkthrough. The provider's terms allow a person's own use of the unmodified binary and rule out several people's runs through one login, and the number of people in an org is the one fact hq can check. Whether hq storing the login is itself permitted is not settled and is to be asked in writing before a public release |
| 13 | hq and its own site come as a pair, connected by configuration: one secret in both environment files, no registration, hq makes sure the default site exists at every boot, and it cannot be revoked. Viewing sites and connecting a site become two screens. hq always has an organisation, created at first boot | Connecting a site by hand was too manual and gave no guidance, and a person who installs hq and a site on one computer should not have to register one to the other. The earlier ruling that hq creates no site of its own was made for a placeholder row that was a ghost; a real service configured beside hq is a different thing. Provisioning further sites from a button stays a later feature (R-170) because it needs published images and Docker access for hq |
| 13 | The full QA audit is no longer Stage 2 of this phase: it becomes a unit of work of its own, run after this unit closes and before any release, and Stage 2 shrinks to a contract catch-up (13.2 to 13.4) | The audit is a heavy, repeated re-verification and is the gate before a release, so it should be planned as one; this unit's window ends before it could run, and a QA audit is by the repository's own convention a unit with its own folder. The contract still had to stop describing behaviour this unit removed, and that bounded part stays here. Tracked by its own issue (**Blocks release**) |
| 9 | The protocol went to 10.1, a minor, and each new name carries its own minimum version | The phase added `site.runtimeCheck`, `preview.start`, `preview.stop`, `preview.connect` and `run.listPage`, all additive under ADR-0046: an older site does not know the names, so hq asks a site for them only at or above the version that has them |
| 9 | A preview process is started in a session of its own and stopped by that session, not by matching its command line | Matching a marker in the command line kills the `pkill` that carries the marker in its own arguments and reports success while the preview keeps running |
| 9 | The migration dropped three `PreviewSession` columns — `hostPort`, `port` and `previewContainer` | hq no longer starts a preview container or publishes a port, so nothing writes or reads them; the preview's container is the boundary's own |
| 9 | A run page's cursor carries the run's start time and id together, and is not opaque | A timestamp alone cannot page a tie between two runs started in the same millisecond. The cursor is an encoding, not a secret, and the source says what a reader can recover from it |
| 9 | Two tests of the onboarding runtime check that asserted the spawn-and-Docker mechanism were skipped, not changed | The mechanism was removed by this phase; rewriting the tests would have written the QA contract against behaviour the unit had not finished, which is done at the close. The onboarding runtime check itself was removed in Phase 13 |
| 13 | Stage 1 ran as seven numbered passes and the contract catch-up as an eighth. Pass 7 grew from the GitHub App routes into a sweep of sign-in and authorisation holes — the open sign-up route closed, invite acceptance hardened, the master key required, role checks on what a viewer may do, private projects staying hidden from a removed member — and the protocol ended at 10.4 | Each of these was found by the register's own scans and by the persona reviews of the QA catch-up, and each was a security exposure, so it was fixed in the unit rather than raised. What was not critical was raised as issues |
| 13 | The two-machine walkthrough (13.7) and the task-run half of 12.3k were not done in this unit | They need a second machine and a project or org credential to run with. The credential exists now (Phase 13); the walk is carried as an issue rather than held open |

## Walkthrough register

Every phase builds behaviour a test suite cannot see: a screen, a flow, a refusal a person has to
read. **The user walks through all of it in task 13.7** — not per phase — and again over whatever the feedback changes.

So each phase records here what its walkthrough needs to cover, as it merges, while the work is
fresh. A phase that adds nothing says so. The register is the checklist 13.7 runs, and nothing in
this unit is accepted until it passes.

### Phase 4 — the ownership model

- **Onboarding, end to end** — create the admin, mint a registration token on the Execution Sites
  page, start site with it. The person completing onboarding becomes the Onboarding project's
  admin, and no project exists without one
- **A project's two tabs** — Members shows people with a role, Agents shows assignments. They are
  visibly different lists, not one list with two kinds of row
- **Adding a person** — the picker lists the org's people, an existing member reads "Added", and
  adding somebody already there changes nothing about their role
- **Making a project private** — on the project's settings page. A second person who is not a member
  then cannot see it on the projects list, the storage page, or by its URL; and can see it again the
  moment they are added
- **The last-admin rule, three ways** — the only admin has no remove control and a disabled role
  control; demoting them is refused with a reason; and removing them from the org is refused naming
  the projects that block it. Appoint a second admin and all three become possible
- **Who may do what** — an OPERATOR cannot create a project, a product or a programme; a project
  admin can rename their own project but not file it under a product; an org admin can file it
  without being a member of it
- **A product and a programme own nothing** — neither has a Files, GitHub or Team tab, and neither
  appears as an owner when creating a workspace
- **Repository attachments** — connecting and disconnecting a project's repository is refused for a
  member who is not that project's admin


### Phase 5 — the content transport

- **Two connections per site** — with a registered site running, hq's log shows the site's content
  connection accepted beside its control channel. Restarting the site reconnects both; revoking it
  on the Execution Sites page closes both, and the content connection does not come back
- **A version mismatch is its own state** — run a site whose protocol major differs from hq's (change
  `PROTOCOL_VERSION` in `core` for one app and rebuild it). The Execution Sites page shows the site as
  "Version mismatch — needs upgrading", with the version the site runs and the major hq needs, not as
  offline; the site's own status page names the version hq requires. The site stays registered, and after it is rebuilt at the
  matching version it reconnects on its own, without a new registration token
- **Work against a suspended site** — opening its workspace or starting a chat on it fails saying its
  runs and workspaces are unavailable until the site is upgraded, not until it reconnects. A task already queued for it reads "site
  unreachable — held for reconnect", which is the known wording gap in the close-out register, and runs once
  the site is upgraded
- **Nothing user-facing streams yet** — the transport carries no content until Phase 5b adds its
  first use; there is nothing else to see

### Phase 5b — packages and delivery

- **Publishing** — as an org admin, edit an agent's instructions on its Prompt tab and change its model on
  Configuration: each save shows the next version number. As a person who is not an org admin, renaming
  the agent works and changing its model is refused with a reason
- **A run uses the new version** — after publishing, the agent's next reply follows the new
  instructions, and its Runs tab shows the version each run used
- **The org's content** — edit the org's profile; an agent's prompt preview for a task shows the new
  text in its Organisation section
- **A project's overrides** — as the project's admin, on its Agents tab, give an agent a cheaper model,
  fewer tools and stricter autonomy: a pricier model is refused, and a run in that project uses what
  was set. A member who is not the project's admin does not see the control. A person can set the same
  for their own storage on the agent's Configuration tab
- **A project's own instructions and skills** — a file at `.agenthix/agents/<agent id>/instructions.md`
  in the project's files appears at the end of that agent's prompt for runs in that project, and a
  skill under `…/skills/<slug>/` is offered as `boundary-<slug>` beside the agent's own; a heartbeat run
  gets neither
- **Templates, import and export** — applying an agent template or a workforce template creates agents
  at version 1 with the template's instructions and skills; an export downloads one version; importing
  it under a new handle creates an agent at version 1, and onto an existing agent publishes its next
  version
- **A site that is too old or offline** — tasks for it wait rather than fail, and run once it is
  upgraded or back
- **Nothing on the site's disk from hq** — hq starts without `~/.agenthix.dev/assets`; the site's
  storage root has no `shared` or `assets` folder written by hq, and an agent's container mounts
  neither
- **Onboarding** — the kernel's onboarding task describes the onboarding steps itself, without telling
  the kernel to read a file from its disk

### Phase 5c — memory held by hq

- **Only your own memory** — sign in as two different people and open the same agent's Memory tab.
  Each sees only their own items, and neither can see the other's. There is no view of what an agent
  knows about someone else, for any role
- **Adding, editing and deleting** — on your profile under Memory, and on an agent's Memory tab. The
  list must update without a manual reload. **No automated test in this repository proves this**: the
  refresh comes from the framework's own invalidation, which a mocked test cannot exercise
- **Promotion** — promote an item from an agent's tab. Read the control's wording and its
  confirmation, and judge whether someone who has never read the design would know what it does
  before clicking. Afterwards the item leaves that tab and appears under Memory on your profile. Try
  promoting something already shared — it is refused
- **The limits** — fill a layer to 50 and read the refusal a person is actually shown; it must name
  the right layer. Paste more than 500 characters and check the refusal is legible and the draft
  survives
- **A failed load** — stop hq and open the tab. It must say it could not load, never "has not
  recorded anything about you yet"
- **A chat remembers** — talk to an agent, tell it something about how you work, and confirm it
  records it and that the item appears in the interface. In a later chat, confirm it knows
- **An unattended run remembers nothing** — run a task and let a heartbeat fire. Neither receives
  memory nor records any
- **The tab strip** — at a narrow window with the panel open, the later tabs are still reachable

### Phase 6 — placement and the container boundary

- **Start a chat from a project's files page.** It now runs on the site holding that project's storage.
  Before this phase it ran on the agent's site while the files might be on another — masked today
  because everything is on one machine
- **Two conversations in one project, then a task run in it.** All three share one container. Confirm
  the second conversation does not start a new one, and that the task run does not either
- **The same agent in two different projects.** Each gets its own container, and neither can see the
  other's files
- **A run's working directory.** It is inside the boundary; the agent has no directory of its own. The
  filesystem section of its prompt should name no workspace
- **The agenda.** In a project it is in your own member folder and is the same file whichever agent you
  work with there; in your own space it is in your files. **This is the repair to check hardest** — before
  this phase the agenda sat outside every mount and no run could reach it, while every prompt told the
  agent to keep it updated
- **A person's knowledge tree.** Agents running in your own space read it; a project run does not
- **An artefact.** Served from the boundary it was made for, and refused to someone not entitled to that
  boundary. **Note nothing in the product builds an artefact link**, so reaching one means constructing
  the address by hand — and a file written at the artefacts root rather than in a subdirectory cannot be
  served at all
- **An agent's avatar.** Upload one and confirm it survives a restart. It now lives in hq's own storage
- **Preview, twice.** Preview from a run in one project, then from a run in another with the same agent.
  The first preview's link must not show the second project's files
- **A heartbeat.** It should reach no storage at all. **The agent image must be rebuilt first** — the run
  is started in a directory that only a rebuilt image has, and nothing checks
- **Rename an agent while it has a container running.** Nothing should move, and the container should be
  left alone
- **Delete an agent.** Its package versions go with it, and the site is asked to remove its directory

### Phase 7 — hq's disk access

- **Download a task attachment.** It works at all, which it did not before — the link was a plain
  anchor against an API that authenticates with a bearer token, so every click was refused. Then check
  a second account that is not a member of that task's project: it must be refused, and refused
  identically whether the file exists or not
- **Upload an attachment, and list them.** Both are now held to the same project rule as the download.
  A non-member must be able neither to add one nor to learn what is there
- **Open a `.png` and a `.html` attachment.** Each arrives as what it is; nothing is served as plain
  text, and an unmapped type downloads rather than rendering
- **An agent's avatar, signed out.** The image route now needs a session. Confirm the interface still
  shows every avatar when signed in — they are fetched rather than linked, so a missed one is a broken
  image no test can catch
- **Browse a project's files, and open one.** hq no longer reads the disk; it asks the site. Stop the
  site and browse again: it must say the site is unreachable, not show an empty folder
- **Create a project.** Its starter documents are written by the site. Then stop the site and create
  another: it must fail, and **the project must not be left behind** — its name and key are unique, so
  a half-made one would make that name unusable forever
- **Finish onboarding with the site stopped.** It must fail and leave you able to try again. The
  completion flag is written last precisely so a failure here is recoverable
- **Attach a repository, and read its state.** git now runs on the site. Watch the site's log rather
  than hq's, and confirm no credential appears in it
- **Attach a repository and interrupt the site mid-clone.** Nothing git started may outlive it — that
  includes a restart on file save in development, which is the case most likely to leak one
- **A preview, and a heartbeat.** Neither changed here, but both touch paths this phase moved; they
  are the cheapest way to catch a path that now resolves somewhere else
- **Two things this phase does not fix, worth seeing.** An agent handed an attachment link cannot
  fetch it — it carries a run capability, not a session. And a location whose git was killed mid-write
  keeps a lock file that wedges every later attachment there, with the reason only in the site's log

### Phase 8 — authority and ownership checks

- **An org admin chats with an agent inside a project, and asks it to create a product or another
  project.** It must refuse. The run acts as the project, and a project has no org authority. Then
  ask the same agent the same thing from a chat outside any project: it must work. This is the
  change most likely to be reported as a regression, and the only way to see it is to try both
- **Your own Claude subscription.** Settings → Profile. Paste a real credentials document, accept
  the terms, and confirm the page shows presence, expiry and acceptance and never the document
  again. Save without accepting: it must refuse. Then use it — a chat in your own storage should run
  on it, and a chat inside a project must not
- **A project's own model API key**, on the project's settings page, project admin only. Set one and
  run a task in the project; remove it and run again, which falls back to the organisation's
- **The organisation's key is encrypted in the column now.** Look at the row directly: it must be
  ciphertext. Re-open the settings page and confirm the key is not read back in full. Set one row
  back to plaintext by hand and restart hq — the boot pass rewrites it and says how many. Start hq
  with no master key set: it must log once and continue, not crash into a restart loop. Corrupt one
  row's ciphertext and open the voice settings: only that row may be affected
- **A boundary with no credential fails loudly.** Delete your subscription and start a chat in your
  own storage. It must fail naming what to add, rather than quietly using whatever the machine had.
  This will surface installs that were working by accident, which is the intent
- **Nothing agent-scoped is left on a site's disk.** `agents/<handle>/` must hold nothing. During a
  run the credential is in the boundary's home; after the run ends it must be gone, and a later run
  in that boundary granted none must find none
- **A long chat that outlives its token.** Claude Code refreshes in place; the refreshed token must
  come back to hq — your settings page's expiry moves — rather than staying on the site's disk
- **A private project, seen by a non-member.** Boards, a board, tasks, a task, a task by its readable
  key, comments, attachments, the backlog and the board series must all refuse. So must every write:
  creating or moving a task, commenting, uploading, archiving, deleting, creating a board, running a
  task or a board. Do it with a second signed-in account, and once as a member for contrast
- **The dashboard's activity feed, watched live.** Create a project and close a task in it as the
  admin while the non-member has their dashboard open. Nothing about it may appear — and the feed
  must come back filtered, not shortened
- **A destination you cannot write to.** As a member of one project and not another, create a task
  aimed at the other project's board, then move an existing task onto it. Both must refuse
- **Two agents working in one project.** Start a run with each, overlapping. Both must proceed, and
  `docker ps` must show one container for that boundary — the agent, session, invoker and task are
  labels, not name segments. Then give the two agents different workspace caps and confirm they do
  still evict each other, which is raised as its own issue and
  deliberately not fixed here
- **What that costs, which is real.** Two agents in one boundary now share Claude Code's whole home
  read-write — settings, session transcripts and history, not only the credential. Run one agent then
  the other and confirm the second can read what the first left. Agent-to-agent isolation inside a
  boundary is genuinely gone; person-to-person isolation was never there. Decide whether it is
  accepted
- **The kill switch.** The "stop all" control must not render for a non-admin at all, and the server
  must refuse it even when the call is made directly
- **Two controls that refuse the person they are rendered for.** An agent's Voice tab now refuses a
  non-admin's save client-side with a message, while staying readable. The org skill library page
  still renders create, update, delete and install to everyone while all four require an org admin on
  the server — check the refusals are legible
- **GitHub Operations against a repository you are not entitled to.** Listing workflows and runs,
  reading and setting repository secrets, and dispatching a workflow must all refuse. And a run
  reaches a repository through its boundary rather than through the agent's assignment
- **Boot hq for real before believing any of it.** A green type check and a green `wasp build` both
  sat on top of a server bundle that could not start, for the whole of this phase

### Phase 9 — preview and reads across sites

- **Start a preview from a chat in a project and open it in a browser** — including a dev server that
  upgrades to a WebSocket, which proves the end-to-end transport and relay rather than just a basic proxy
- **Watch the preview keep serving while the chat is idle** past the container's idle sweep window,
  and verify the container stops when the preview is closed
- **Register a second Execution Site, leave it offline, and open the dashboard** — the site appears
  in the "unanswered" notice with its reason and does not break or delay the overall merged feed
- **Create a project with multiple sites registered** — the chosen site is where its files and containers
  land, and selecting an offline, revoked or version-incompatible site is refused with a clear message
- **Verify HQ starts no containers** on boot or during any of these flows — all container execution
  is strictly performed on the Execution Site

### Phase 10 — credential rotation

- **Rotate a site's credential from its status page** — click "Rotate Credential" on a linked site's status page. Verify the button shows "Rotating…", then confirms success. Check the site's log to see the socket cleanly reconnect to HQ with the new credential without re-registering or minting a new token
- **Verify old credential is immediately invalidated** — attempt to connect or authenticate with the previous credential; HQ must refuse with 401 Unauthorized
- **Bootstrap key refused once a user exists** — with an existing user in the database, attempt to validate or accept an invite using `SITE_ADMIN_KEY`; verify it returns 410 Gone ("Bootstrap key no longer valid") rather than granting admin access
- **Invite rate limiting across server restarts** — make repeated failed attempts against `/api/auth/validate-invite` or `/api/auth/accept-invite`; verify that after 5 attempts the endpoint returns 429 Too Many Attempts, and restarting the HQ process preserves the count and lockout in PostgreSQL

### Phase 11 — operator console authentication

- On a fresh site, `agenthix-site register <hq-url>` prints a code; approving it at
  **Execution Sites → Approve a site** shows the site's name, host and connecting address,
  and the command then reports it registered and `status` reports it connected
- Denying a code makes the command stop and say an admin denied it; letting it run past 15
  minutes makes it say the code expired
- A non-admin opening the approval page is told only an admin can approve
- **Rotate credential** on the Execution Sites page reconnects the site with a new credential,
  and it stays online; against a 10.1 site it names the version to upgrade to
- `agenthix-site unregister` removes the site from hq's list as revoked; with hq stopped it
  still forgets its credential and says hq could not be told
- Nothing on the site operates it from a browser: its old status page and operations return 404,
  `/` shows only a fixed sentence, and the control socket is reachable only by the site's user
- With hq and the site on separate machines, the whole registration runs with the site behind
  NAT — approved from a browser that can reach hq only

### Phase 12 — the deployment shape

- **Both stacks build and boot from their own compose files** — `hq/compose.yml` and
  `site/compose.yml`, each from its own `.env`. hq answers `/health` through its Caddy web
  container; the site opens no port on its machine
- **A site registers with the command run inside its container**, prints a code, is approved at
  hq's Execution Sites page — which shows what the site claims and what hq observed as two separate
  groups — and `agenthix-site status` then reports Connected
- **A forged `X-Forwarded-For` on a registration request is replaced with the address hq actually
  observed** — checked directly against a live device-code request, not inferred from logs
- **A chat run completes with a person's own credential.** Its container sits on a network of its
  own, whose only other member is the site; it resolves the site by name, cannot resolve the site's
  database, and reaches the internet; the site publishes no port throughout
- **A task run completes with a credential its project may use.** Not exercised in Phase 12 — no
  project or org API key was available during the walkthrough (close-out register, R-136)
- **Two different boundaries' containers cannot reach each other.** Not exercised — only one
  boundary's container was ever live at once; needs a second, concurrent run from a different
  boundary once a task run can complete
- **Restarting the site on a non-empty, already-owned data folder succeeds** — the entrypoint's
  ownership guard, added in the final review's fix wave, was never re-tested against a real restart
- **hq refuses a plain `http://` address it reports back to a registering site**, the same as one
  typed by hand — implemented in the final fix wave, not re-verified live
- **The whole flow on two separate machines** — hq on a server behind its own front door, a site on
  a home network: public HTTPS, the internet between them, no shared disk or Docker daemon. Not
  attempted in Phase 12; a task run is part of the proof, so it waits on the same fix

## Open items

Held in [`issues.md`](issues.md), the unit's close-out register, which is updated until each item is fixed or raised as its own issue.
