---
created: 2026-09-15
description: Finishing what the hq/site split left undone and settling the run security boundary with it — hq and its sites run on separate machines, a run reaches only what it is entitled to, and no critical bug from the split remains.
---

# hq/site Split Close-out — Design

**Succeeds:** the unit `2026-08-14-hq-site-split`, whose branch merged in `b709254` but which never
closed. This unit takes over the split's unfinished work rather than continuing its plan, and
closing that unit is part of this one.

**The milestone and its objectives** are on the platform roadmap as *hq/site split closed out and
secured*. This spec does not restate them; it says what each must do.

**It absorbs the run security boundary**, which was planned as the milestone after this one. Where
storage lives, where an agent's package is held, whose authority a run carries and how one site is
kept from another's data each depend on the others, and the storage boundary is the split's own
unanswered question — so they are planned and designed as one. The proposals for the storage boundary
and for agent identity not being authority are inputs to that design, not decisions.

> **In progress.** Sections 1–4 are settled, and §4's work is done and merged. **The seven interlocked
> questions are now designed: §6.1–6.7 hold them, decided and not yet built.** Section 5 keeps the
> three that are designed on their own — credential rotation, operator console authentication and the
> deployment shape — which are Phases 7 to 9.

---

## 1. The problem

The split moved the execution runtime into `site/` and made hq dispatch every run over the control
channel. It did not finish the move, and what it left behind was recorded in places that read as
tracking — a *work not assigned to any plan* list in its implementation plan, and a *known issues
carried* section in its branch-finish walkthrough — so none of it reached the backlog.

Checked against the code on 2026-09-15, at `94f65e8`:

- **hq still reads and writes the Execution Site's disk.** Agent provisioning, skills, workspace
  storage and git, file and avatar serving, zip import and export, kernel bootstrap, task
  attachments and the voice cache all resolve paths under `SITE_ROOT`. No control-channel method
  moves a file. It works only because hq and its site share a filesystem.
- **hq starts containers itself** — for preview, for the onboarding runtime check, and for voice
  phrase generation — although under ADR-0050 hq executes nothing.
- **hq still boots the dial-out client** and `HqConnection` model from before the split.
- **The site cannot be deployed.** It has no image, no compose service and no deploy path; the
  deploy workflow builds hq alone.
- **A second site is invisible.** Dashboard, activity, storage and run-log reads go to whichever
  site registered first, and new agents are placed there by default.
- **Revoking a site does not take effect**, and the control-channel credential never rotates.
- **Two exposures.** Site's operator console is unauthenticated and listens on every interface, so
  an unregistered site can be claimed by anyone who reaches it. Any signed-in hq user can list and
  read any storage location's files.
- **A fresh install breaks.** Onboarding reads an asset path that does not exist, new agents are
  created without their identity files, and agents are pointed at an `ORG.md` they cannot see.

Checked again on 2026-09-15, after the first part of §4 merged, at `3094753`:

- **Where an agent's identity lives is undecided.** Its profile, responsibilities, heartbeat and
  skills are files on one site's disk, which hq writes directly. An agent working for a person or
  project on another site has no way to reach them.
- **A container's reach follows the agent, not the work.** It mounts the files of every project and
  product the agent belongs to, so one run reaches many owners' storage, and that reach grows as the
  agent joins projects.
- **Whose authority a run carries is undefined** — the person who started it or the project it runs in
  — and so are the ownership rules for boards, skills, sessions and GitHub on the server's write paths.
- **More exposures, found by the second sweep.** An attachment's file name can write anywhere hq can;
  hq's file reads, including an avatar route that needs no sign-in, follow links an agent plants; repo
  operations skip the location access check; a git operation hq runs can execute hooks an agent
  planted; skill writes touch disk before their names are checked; and one site can archive another
  site's session.
- **A fresh install still breaks in two more places.** The kernel's identity and onboarding files are
  seeded where nothing reads them, and hq's bundled assets had dropped out of the repository.

## 2. What critical means here

**A critical bug is anything hq and a site cannot run on separate machines without, or a security
exposure or breakage that should not reach public release.** Every item above is critical by that
definition. The milestone is finished when none remains.

Items the split left that are neither — prompt preview losing its sections, session titles written
on the wrong side, the credential-health badge — are the milestone's cuttable bonus. Those that need
no design are in §4, marked as bonus; the rest of the milestone's bonus is left to the unit's close.

## 3. How open items are handled in this unit

**Items this unit surfaces may stay open between phases, and none stays open past its close.** At
close each is either fixed, or raised as its own issue. A critical item is fixed; if the unit closes
with one still open, it is raised at High priority or above with its **Release** field set to
**Blocks release**, so the code may sit on `main` but is not released until the issue closes.

This is the org's close-out rule, adopted on 2026-09-15 because of how the split unit ended. This
unit is its first application.

## 4. First: the work that needs no design

**This comes before any design work.** Each item below has one obvious correct behaviour, visible in
the code as it stands, so it can be done now — and doing it first shrinks what the design has to
cover. Every behaviour change lands with a test written first; no QA contract work happens until
the unit closes.

### Critical

1. **Onboarding completes on a fresh install.** It reads the kernel's initial agenda from the asset
   path where that file actually exists.
2. **A new agent is created with its identity files.** Provisioning copies the profile,
   responsibilities and heartbeat files from the agent template's actual location.
3. **Agents can read the org's `ORG.md`.** hq writes it where agent containers mount shared org files
   read-only, which is the path the agent prompt already names.
4. **A user can list and read only storage locations they are entitled to.** The two storage read
   operations apply the same location access rule the agent path already enforces; a request for
   someone else's personal files is refused.
5. **A site cannot update another site's sessions.** hq applies a session status or stream update only
   when the site sending it owns that session, as task updates already require.
6. **Revoking a site takes effect at once.** hq sends the site the revoke frame the protocol already
   defines, closes its open channel, and refuses to dispatch any run to a revoked site. Rotating the
   credential is not part of this — see §5.
7. **hq no longer carries the pre-split dial-out client.** Its connection manager, the HQ connection
   settings page and its navigation link, its query and actions, and the `HqConnection` model with the
   three `UserSettings` fields that reference it are removed. The migration drops data, so it runs only
   with explicit approval.

### Defects in code the design would otherwise work around

8. **The agent tools for listing and applying avatar and cover presets** read the same preset folders
   the UI does.
9. **Deleting an org library skill** removes its source, not only its installed copy.
10. **`request_workspace_git` is no longer advertised to agents**. Serving it would need design;
    no longer offering a tool that nothing serves does not.
11. **Code comments that describe the pre-split shape are corrected** — among them "hq has no socket
    server for sites yet", site "does not yet serve" dispatch methods, and the "mcpHandler interim".

### Bonus

12. **Prompt preview shows its sections again**, with editable sections editable. Site already builds
    the sections; the preview response carries them instead of one flattened string.
13. **Auto-generated session titles are written by the site.** Site's naming service generates the
    title and returns it with the existing session update; hq's copy of the naming service is removed,
    so the title has one writer as the split's ownership rule requires.
14. **The Execution Sites settings page shows each site's link to hq as it is now**, not as it was
    when the page loaded: a site that connects, drops or is revoked while the page is open shows its
    new status without an action or a reload. Who owns an agent's Claude login is not settled, so
    credential health is not shown here; the admin notifications it already raises are unchanged.

### Second part — found after the first

Done after the first part merged, still before any design.

15. **An attachment's file name cannot place it outside its folder**, whether uploaded in the browser or
    attached by an agent.
16. **hq's file reads do not follow links out of the location they serve** — the file explorer and the
    agent image route both refuse a target whose real path leaves the authorised directory.
17. **Repo state, connect and disconnect apply the location access rule** that the storage reads already
    enforce, including for another person's files.
18. *Moved to §5.5.* Stopping a git operation hq runs inside a location from obeying configuration found
    there has no obvious fix — see that item.
19. **Creating a library skill, and installing or removing a project skill, validates its name and
    project before touching disk**, and updating a library skill writes only its name and description.
20. **A task's terminal frame archives only that task's session**.
21. **A transient failure to look up a session's owner does not drop a terminal frame**.
22. **The system status query requires sign-in**, and the run list returns only runs the caller
    may see (what remains of that issue after the first part removed its other two reads).
23. *Settled in §6.8.* Making the invite rate limit hold across restarts and instances —
    see that item.
24. **The kernel's identity and onboarding files are seeded where the kernel reads them.**
25. **hq's bundled assets are tracked in the repository again.**

Found while planning this part, and added to it:

26. **Linking a repo accepts only a `github.com` URL**, so the GitHub token git is given cannot be sent
    to another host.
27. **An agent's handle is a valid handle** on creation and rename, so it cannot place the agent's
    folder outside the agents directory.
28. **Creating a project, product or program takes only the fields it may be given**, so a caller
    cannot choose the id its folders are built from.
29. **The task session and task run queries require sign-in**, and refuse with the same error the other
    signed-in queries use.
30. **hq's writes and deletes under an agent's private folder refuse a target whose real path leaves
    it**, as its reads do after item 16.

**Left for the design, not done here:** the Products and Programs pages' site picker lists hq's own
pre-split site record as always online, and product creation ignores the site chosen — correcting it
means deciding which sites to offer and where new work is placed, which §5.1 settles.

**Left for the unit's close, not done here:** closing the split's own unit (its open items are this
unit's work), retiring scenario SC-288, and renaming the QA contract files that still say `site` —
the last two are QA contract work.

## 5. Still to design

Each of these needs a decision before it can be planned.

**Designed together** — each answer constrains the others, so they are settled in one pass:

1. **Storage and placement** — **settled in §6. Designed, not yet built.**
2. **The agent package** — **settled in §6.2. Designed, not yet built.**
3. **Authority** — **settled in §6.3. Designed, not yet built.**
4. **Ownership rules** — **settled in §6.4. Designed, not yet built.**
5. **hq's disk access** — **settled in §6.5. Designed, not yet built.**
6. **Where preview runs** — **settled in §6.6. Designed, not yet built.**
7. **Reads across several sites** — **settled in §6.7. Designed, not yet built.**

**Designed on their own** — nothing above depends on them, and they on nothing above:

8. **Credential rotation and revocation** — **settled in §6.8. Designed, not yet built.**
9. **Operator console authentication** — how a site's console refuses someone who is not entitled to
   register it. **Settled in §6.9. Designed, not yet built.**
10. **The deployment shape** — the site's image, how hq and a site are deployed apart, and how a
    site is configured to register. It proves running apart end to end, so it is designed last.
    **Settled in §6.10. Designed, not yet built.**

---

## 6. The design — settled here, not yet built

Each part below is decided. None of it is built: the build tasks are Phases 4–6 of the plan, and the
code still behaves as §4 leaves it.

### 6.1 Storage and placement

**The thing being protected is a storage location, and it is what a run is bound to.** A run reaches
exactly one owner's storage — one person's, or one project's — and the container serving it is bound
to that location for its whole life. A container is never rebound from one owner to another: one that
has served a project is destroyed rather than remounted. Isolation stops depending on the mount set
being assembled correctly and becomes a property of which container the work was placed in.

**A run happens on the site holding the storage it is for**, and the site follows from the location
rather than being chosen. This replaces [ADR-0047](../../adr/adr-0047-where-a-run-may-execute.md)'s
rule that an agent is pinned to one site and work is refused when it would cross.

**One boundary per run is not a policy choice.** A person's storage and a project's storage may sit on
different sites, and protected data does not move between sites. A run's container can bind only
directories on the machine it runs on, so a design that mounted both would work on a single machine and
fail as soon as a second site existed. The rule follows from placement; it is not imposed on top of it.

**What this removes.** Today a run also mounts the files home of every project and product *the agent*
is a member of, so one container reaches several owners' storage and its reach grows whenever the agent
joins something. Those mounts go. Task 3.2 established from the code that nothing relies on them: no
tool, no service and no test reads them, and the only thing that names them is the prompt's filesystem
list. Reaching another owner's files becomes a separate run against that owner.

**What this keeps.** A task run mounts the project's files, its knowledge, every workspace of the
project and its task working directories. That set is wide but belongs to one project, so it survives
unchanged — [ADR-0039](../../adr/adr-0039-files-and-workspaces.md) §10 and this rule do not conflict.

*Corrected at the Phase 6 build:* this said "the task's own directory". The mount set has to be a
function of the owner alone, or the boundary's container would be destroyed and recreated on every
alternation between a chat and a task — so the whole `tasks/` root is mounted and the run's working
directory is a path inside it. The consequence is wider than the sentence above implies: every run in a
project, a chat with write tools included, can read and write every task's working files. It stays
inside one owner, so rule 1 holds.

#### A person's space inside a project

A project is a shared location, and a member's own area within it is a folder on that shared disk —
the arrangement a team already understands from any shared drive. `projects/<id>/members/<userId>/`
holds that person's drafts and their agenda, and it is visible to the project like everything else
there. Someone who wants something private works in their own storage instead.

This keeps the container keyed by the storage location alone: everyone active in a project shares one
container, with no per-person mount decision to get wrong.

#### Memory, and knowledge

They are different things and the design keeps them apart.

**Knowledge is a file tree** — folders and documents an agent walks, reads and searches. It lives on
the disk of the boundary that owns it, and every agent working in that boundary reads it. A project's
`knowledge/` is unchanged from today. A person gets one too, in their own storage, read by agents
running in their own space. Knowledge is readable only inside its own boundary; using a person's
knowledge in a project means deliberately copying it there.

**Memory is a few lines of text about a person**, and hq holds it, in two forms:

| | About | Read by | Written by |
|---|---|---|---|
| **Global memory** | the person | every agent that person invokes, anywhere | the person |
| **Agent memory** | the person | that one agent, anywhere | the person, or that agent on their behalf as it works |

Both layers are the person's: they add, edit and delete in either and promote an item out of an agent's layer into the shared one. An agent can add to and forget from only its own layer, and each item records whether the agent or the person wrote it. "Agent memory" names only the scope — the person's memory, kept for that one agent and reachable by no other agent.

One partition per person and agent. An agent never sees what a person told a different agent — a rule
that holds for the same reason [ADR-0048](../../adr/adr-0048-partitioning-an-agents-memory-of-a-person.md)
partitioned memory in the first place, applied to a layer that travels rather than to a mount.

**Promotion is the only way anything crosses**: the person moving something out of an agent's memory
into global memory, so every agent they invoke knows it. It is a deliberate act with a person behind
it, not a background copy.

Both forms ride in the dispatch context, which already carries the owner slugs and the agent roster,
and both are written back through hq rather than as files. A site
therefore never holds them, and there is no second copy to reconcile. A run nobody invoked — a task or
a heartbeat — receives neither, which is what the code decides today and is kept.

This is what replaces ADR-0048's per-person mount, which a storage-bound container cannot carry. It
also answers the objection that boundary-scoped memory makes one agent feel like a different agent in
each place: because hq holds it, an agent's memory of a person is the same in every boundary, and the
person can read and edit what is held about them.

#### The rules, in one place

1. A run reaches exactly one owner's storage.
2. A run happens on the site holding that storage.
3. A container is bound to one storage location for its life, and is never rebound to another owner.
4. Anything that must be readable from more than one boundary is held by hq, and is small text.
5. No site holds what another site also holds, so nothing is ever reconciled.
6. Nothing scoped to an agent is mounted into a container.

#### What this leaves open

These follow from the decision above and are settled with the parts of §5 still to design, or in the
build phase that carries them:

- **Residue between runs.** One person's run leaves files in the writable layer and the temporary
  directories that the next person's run in the same project container can read. Storage isolation
  holds; hygiene between runs does not, and needs a defined reset.
- **Limits and concurrency.** A container's memory and process limits are sized for one run today.
  A busy project now runs several at once in one container.
- **The idle window and eviction**, which ADR-0049's existing sweep already implements — only the key
  it sweeps by changes.
- **Where an agent's own writes go**, now that nothing agent-scoped is mounted: its skills, its
  workspace, and its Claude login. That is §5.2 and §5.3.

### 6.2 The agent package

**An agent is a versioned package held by hq, and a record hq keeps about it.** The package is
immutable and the same everywhere; the record is what identifies the agent. A site fetches a version
it does not hold, caches it, and loads it into a run. It is never a second master, because nothing
downstream writes to it.

| | Holds | Changes by |
|---|---|---|
| **The package** — `scout@1.7.3` | `instructions.md`, `heartbeat.md`, skills; and the settings that shape behaviour: model, runtime, tool ceiling, autonomy, heartbeat interval | publishing a new version |
| **The record** — hq's `Agent` row | id, handle, name, role, avatar, voice, memberships | editing the agent |

**Behaviour is versioned because that is what versions are for.** A run records that it used
`scout@1.7.3`, and rolling back to `scout@1.4` restores how the agent behaved, not merely what it
read — the same instructions under a different model and a wider tool ceiling are a different agent in
practice. Changing a setting therefore publishes a version rather than editing a field.

**One duplicate disappears.** hq writes its own row's fields into `PROFILE.md`'s frontmatter on every
change, so name, role, model, runtime and heartbeat settings exist both in hq and on a site's disk.
The package carries the settings; the file stops carrying a copy.

**Three identity files become two.** `PROFILE.md` and `RESPONSIBILITIES.md` are both read on every run
and concatenated in order, so they are one block of text split across two files — and the split
leaks, with library agents stating what they own in the profile and how they behave on heartbeat in
both. They merge into `instructions.md`. `HEARTBEAT.md` becomes `heartbeat.md` and stays separate,
because it is read only when the agent wakes on its own. The remaining distinction is when a file is
read, not what a person is supposed to put in it. Merging the shipped library agents and any existing
agents is a one-time step in the build.

**Renaming stops moving anything.** The package keys on the agent's id, so a rename changes hq's
record and nothing else. Today a rename moves the agent's directory while its containers still run
under the old name.

#### Two layers

The package is the default. A **boundary** — a project, or a person's own storage — may override it.
There is no site layer: a site is not a security principal in this design, and a person's overrides are
simply the overrides on their own boundary.

**A person working in a project gets the project's agent.** Ada in Atlas runs Scout as Atlas
configured it; a shared workspace is not hers to tune. Her own space is where her own settings apply.
Preferences that should follow her everywhere are global memory (§6.1), not an override.

**Where an override lives depends on what it changes**, by §6.1's fourth rule:

- **Instructions and extra skills** are files on the boundary's own disk. Only runs
  in that boundary read them, and they are a file tree the run walks.
- **Model, tool ceiling and autonomy** are held by hq against the boundary. hq decides what a run may
  do before the run starts, and a site cannot be the place that decides its own permissions.

**An override narrows and never widens.** A project may give an agent fewer tools than its package
allows, or a cheaper model; it cannot grant more than the agent has. The run's toolset is already an
intersection, and this keeps it one.

**A resync moves the package and leaves the overrides standing.** A boundary follows the current
version unless it pins one; either way the run records the exact version it used.

#### Skills are namespaced

Today four sources — platform, org, project, agent — share one flat slug, and the highest precedence
silently replaces the rest. A run cannot say which `review` skill it got. Skills become namespaced by
their source, so an override adds rather than replaces, provenance is visible in the run, and a
package's skills carry its version.

#### What this leaves of an agent's own disk

Nothing scoped to an agent is mounted (§6.1 rule 6), so everything the agent keeps on a site today has
somewhere else to be:

| Today | Under this design |
|---|---|
| `workspace/` as the run's home | The cwd is the boundary's own storage. The agent has no working directory of its own |
| `.private/` identity files and skills | The package |
| `.artefacts/` — files hq serves back to people | The boundary the work was done for, which is who those files are for |
| `agenda/` | The member folder in a project, or the person's own storage (§6.1) |
| `users/<userId>/` memory | hq, as agent memory (§6.1) |
| `home/.claude` credentials | Still to settle — §5.3 |

**An agent authoring a skill for itself** therefore publishes a version rather than writing a file. A
skill written for one project is an override in that project, and stays there.

#### The heartbeat

A heartbeat run fetches its queue, picks a task and dispatches it — all control-plane calls, no files.
It runs with the package and **no storage boundary at all**, and the work it starts runs in the
boundaries those tasks belong to.

This corrects behaviour that is not a design: a heartbeat session carries no primary location, so
placement falls through to the session's user — the admin the session was created under — and an
org-wide autonomous run currently executes inside that person's personal files home.

#### What this leaves open

- **How a site verifies what it fetched**, and whether packages are signed or checked by digest.
- **How the package crosses the control channel.** [ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md)
  admits typed events and no generic relay, and a package is bigger than anything crossing today.
- **Cache eviction on a site**, and what a running container does when a new version is published —
  the next run picks it up, but a long-lived container's behaviour needs stating.
- **Who may publish a version**, which is §5.3's question about authority.

### 6.3 Authority

**A run's authority comes from its boundary, and never from a union.** A run in a project acts as the
project; a run in a person's own storage acts as that person. A person working in a project does not
lend the run their own access, and the project's access does not follow them home. This is §6.1's
sentence applied to what a run may *do* rather than what it may *read*, and it is what
the proposal asks for: agent identity is not authority.

**Membership is the gate; the boundary is the authority.** Being entitled to the boundary is what lets
a person start a run in it. What the run may then do is the boundary's, identical for every member.

| The run | Acts as | Started by |
|---|---|---|
| A person in their own storage | that person | them alone |
| A person in a project | **the project** | any member |
| A task | the project the task belongs to | the scheduler or a member |
| A heartbeat | nobody — it has no boundary (§6.2) | the scheduler |

The code already carries half of this: a role is attached only to a person-invoked chat, and task and
heartbeat runs get none, which it calls the unattended rule. What changes is the other half — a
person-invoked run in a project stops carrying the person's role and carries the project's.

**One class of member, for now.** Everyone entitled to a project can do what that project's agent
does. A read-only member is deliberately not offered: a run's write mode is a property of the
container, and a project has one container that its members share (§6.1), so narrowing per person
would mean a container per person.

**If a reader class is wanted later, it keys on the mode, not the person**: a project would hold at
most two containers on the same storage, one read-write and one read-only, and read-only members'
runs would be placed in the second. The count stays at two however many members there are. Recorded
here so the option is not lost, and not built now — nothing in the product offers a read-only project
member today.

#### External credentials belong to the boundary

A repository is reachable by a run because **the boundary owns the attachment**, not because the
caller is signed in. The org's single GitHub App installation stays the mechanism; the attachment —
already keyed by owner on the site — is the authority. The same rule generalises to whatever
integration follows.

This is why §4 deferred the GitHub Operations fix. `getWorkflows`, `getRuns`, `getRepoSecrets`,
`setRepoSecret` and `dispatchWorkflow` check only that the caller is signed in, so any signed-in
person can list, overwrite secrets on and dispatch workflows for any attached repository, including
one attached to another person's files. The missing check is not sign-in but ownership of the
attachment, and it is the check the storage routes already apply.

#### Model access is supplied per run, and belongs to the boundary

An agent must hold no standing credential of its own, or its authority accumulates across everyone it
works for. It does not need one: hq resolves a model credential at dispatch and passes it in the run
context, and the container receives it. What is decided here is whose credential that is, when it may be
used, and how a person provides one.

**A credential belongs to a boundary — the org, a person, or a project — and is either an API key or a
subscription login.** A run uses its own boundary's credential and falls back to the org's:

| The run | Uses first | Falls back to |
|---|---|---|
| A person in their own storage | that person's | the org's |
| A project run, or a task | that project's | the org's |
| A heartbeat | the org's | — |

Where one boundary holds both kinds, the subscription is used while it is usable and the API key
otherwise. A subscription runs on the Claude SDK runtime only; the native runtime uses an API key.

**A subscription is for one person's own use, and what follows from that is one fact hq can check: how
many people the org has.**

| Where the subscription sits | It is usable |
|---|---|
| A person's own | in an org of any size, and only by that person's runs in their own storage |
| The org's, or a project's | only while the org has exactly one person |

When an org has several people, an org or project subscription stays stored but is not supplied. A run
that would have used it falls to the next credential and, with none, is refused with an error that says
what to do: the person adds their own login, or an admin sets an API key. Whether an org has one person
or several is read each time it is needed and never stored, so a subscription comes back into use if the
org drops back to one person. API keys are unaffected.

**A subscription is allowed, and the person is warned.** Setting one shows that a subscription covers
one person's own use of Claude, that it works only for their runs, and that an org with several people
cannot use an org or project subscription. The person accepts this, and hq records that they did before
the credential is used. This is the line the provider's terms draw: a subscription covers a person's own
use of the unmodified Claude Code binary, not several people's runs through one login.

**The person signs in themselves, on the provider's own page.** Choosing "Sign in with Claude" at a
boundary has hq ask a connected site to start a throwaway container from the agent image and run the
binary's login with its input held open and no terminal. hq shows the sign-in link the binary prints; the
person opens it, signs in on the provider's page, and pastes the short code it shows back into hq. hq
writes that code into the same running process, which finishes the login — it has to be the same process,
since the proof it needs lives only in its memory. The site reads the resulting credentials file once and
hands it to hq, and the container and its scratch folder are deleted. hq stores the credential encrypted.
The login needs a site: with none connected, choosing it fails with the same explicit error as anything
else that needs one. An abandoned login is removed after about ten minutes.

**hq holds the credential and supplies it per run.** A refresh during a long run reaches hq rather than
a site's disk.

With that mount gone, `agents/<handle>/` holds nothing, and the last agent-scoped mount is gone
(§6.1 rule 6).

**A run with no usable credential is a visible state.** The run is refused with an error that says what
to do. Admins also see a persistent banner while shared runs — tasks and project runs — have no usable
credential: there is no org API key, and either the org has several people or no org subscription is
set. It clears as soon as that stops being true. People who are not admins see only the error, when they
try to run something.

**Publishing a package version is an org act, not a boundary's.** A version changes the agent
everywhere, so it belongs with whoever administers agents. A boundary's own adjustments are overrides
(§6.2), which change nothing for anyone else.

#### What this leaves open

- **How a refreshed subscription token reaches hq** for an org or project subscription: the event a site
  sends checks that the claimed person's storage is placed on that site, which a shared boundary has no
  equivalent of.
- **How credentials are encrypted at rest**, and the rotation questions in §5.8.
- **Whether hq may hold a subscription login** for a self-hosted install. The provider's page says a
  product may not "collect, store, or intermediate" these credentials, and allows a person signing in to
  the unmodified binary on a platform that hosts it. The question is the provider's to answer, in writing.
- **Whether a project may hold more than one attachment to the same repository**, and what a
  person-owned attachment means once runs in a person's own storage act as that person.

### 6.4 Ownership rules

#### Two things own, two things group

A **person** and a **project** own storage, carry authority and are what a run is bound to. A
**product** and a **programme** group projects for reports and lookups, and own nothing: no files, no
workspaces, no members, no runs. Filing a project under one grants nobody anything.

This narrows today's four owner kinds to two. Products and programmes acquired storage before
workspaces existed, when they were the only way to group repositories that belonged together; a
project with workspaces now does that job. Jira draws the same line — a project category is
organisational only and is never consulted by a permission scheme, and a Plan grants no access to the
projects it shows.

Two consequences in the code: a workspace owned by a product or programme moves under a project, and
the product directory helper — which returns a path "containing `wiki/` and room for future
product-level content", keys on the slug rather than the id, and has no callers — goes. The product
wiki once named as exposed content was never built.

#### People are members; agents are assigned

They are different concepts and take different names.

| | What it means | Table |
|---|---|---|
| **A project's members** | the people entitled to it: they may start runs in it and write what it owns | `ProjectMember` — new, keyed on the person |
| **A project's agents** | which agents the project uses, for assignment and for its overrides | `ProjectAgent` — today's `ProjectMember`, renamed, keyed on the agent |

**An agent's assignment grants it nothing**, because an agent carries no authority at all (§6.3). This
removes the last thing agent membership decided: today an agent must be a project member to be
granted the project's repository credentials, which is agent identity acting as authority. Under §6.3
a run reaches a repository because its boundary owns the attachment, whichever agent is running.

`ProductMember` is removed. It existed so containers could mount product files, and products now own
nothing.

**The migration renames before it creates.** Today's `ProjectMember` rows are agents. The rename to
`ProjectAgent` happens first, and only then is a new `ProjectMember` created for people. In the other
order, agent rows land in the people's table with no error and every access check is wrong in the
permissive direction.

#### Open or private

A project has an access level.

- **Open** — everyone in the org is a member. The default, and what every project is today.
- **Private** — the member list decides. Someone not on it cannot see the project, start a run in it,
  or write anything it owns.

A single-person install therefore behaves exactly as it does now, and nobody meets membership until a
second person arrives. This is Jira's team-managed model, where a project's access level decides what
role everyone else gets by default.

#### Two roles, and they are not the same word

| | Decides | Exists today |
|---|---|---|
| **Org admin** | products and programmes, and which one a project is filed under; registering and revoking sites; inviting people and setting org roles; publishing agent package versions | yes — `ADMIN` |
| **Project admin** | that project's members and access level, its agent overrides, which agents it uses, and its repository attachments | no — new |

**A project admin's run authority is identical to a member's.** Administering a project is a
control-plane act, so it adds no container and does not touch §6.3's one class of member.

**An org admin does not implicitly reach every project.** They may add themselves to a private one —
that is what administering the org means — and the addition is visible in the member list. What they
cannot do is read it quietly. Jira holds the same line: a Jira admin inherits *administer projects*
but not *browse projects*, and still needs browsing granted per project.

#### The check every write path applies

**A person may write a resource when they are entitled to the boundary that owns it.** Every resource
resolves to one: a board, task, comment or workspace to its project; a session to its boundary; a
repository attachment to its owner; a person's files to that person. Entitlement is membership of an
open project, of a private project's list, or being the person themselves.

**Role floors stay where the act is org-level** — creating a project, deleting or archiving a task,
registering a site. Those already exist and are already right. The rule is the same separation Jira
keeps: administering structure is global and gated by role; acting inside a project is decided by that
project.

Today most write paths check only that the caller is signed in — projects, boards, tasks, comments,
skills, sessions and agent voice among them. With one operator there is no exposure; with two,
any signed-in person writes another's work.

#### The kill switch

`stopAllSessions` cancels every active run and is gated on sign-in alone, so any signed-in person,
including a `VIEWER`, can stop all work in the org. Since the split it sweeps **every**
registered site, not one.

It stays org-wide and is gated to the org admin. A brake that stops only your own work is not a
brake, and per-session stop — scoped by the ownership rule above — is what an operator uses.

#### Secrets at rest

`Provider.apiKey` is stored in clear text, and since §6.3 that column holds the model credential every
run uses. The encryption helper this needs already exists and already protects the GitHub App private
key and the token signing keys, so this is a build task rather than a design question. The
per-repository SSH deploy keys once raised with it no longer exist in either schema.

#### A project always has an admin

**No project may be left without a project admin.** The rule is enforced where a project would lose
its last one — removing that person from the project, demoting them, or removing them from the org.

**Removing a person from the org is checked before it is applied.** If it would leave any project
without an admin, the removal is refused, and the org admin is told which projects block it so they
can appoint replacements first. An org admin may appoint a project's admin — that is part of
administering the org — and it is how a replacement is put in place before the last one goes.

**A person who leaves keeps their data.** Their own storage is retained rather than deleted: work
they did on projects is the project's and unaffected, and their personal boundary continues to exist
with nobody able to start runs in it.

#### The project screen

A project shows two lists, side by side as tabs: **members**, the people entitled to it, and
**agents**, the ones it uses. They are different concepts (above) and stay visibly different, rather
than one list with two kinds of row.

#### What this leaves open

- **Who may reach a departed person's retained storage**, and for how long it is kept. It is a
  boundary with no person, which no rule in §6.1 to §6.4 describes.
- **Whether a reader class is wanted** — someone who may see a project and change nothing, neither
  through the interface nor by asking an agent. §6.3 keeps it available, keyed on the mode rather than
  the person, because a run that may not write needs its own read-only container. Jira's *browse
  projects* permission is the same idea and is standard there.

### 6.5 hq's disk access

hq reads and writes an Execution Site's disk in more than a dozen places, and every one works only
because the two share a filesystem. Each takes one of four routes.

| Route | What goes this way |
|---|---|
| **Delivered by hq** | content a run reads that is not the boundary's own data |
| **hq's own storage** | things only hq ever reads, on a site's disk today because the disk was there |
| **Over the control channel** | the boundary's own data — the site owns it, hq asks |
| **Removed** | paths that exist because of a shape this design removes, or that nothing calls |

#### Delivered by hq

An agent's identity files and skills are the package (§6.2). Two more kinds of content are read by
every run in every boundary, so by §6.1's fourth rule they cannot live on any one site's disk:

- **The org's content** — `ORG.md` and the skills the org installed for everyone.
- **The platform's content** — the skills that ship with Agenthix itself.

Both become versioned packages held by hq, fetched and cached by a site exactly as an agent package
is. The `/shared` and `/assets` mounts go, the site's image stops carrying bundled assets, and the
deploy step that copies them onto a site's disk goes with them.

**Platform content is delivered rather than shipped inside a site, and the reason is consistency.**
A package version exists so that `scout@1.7.3` means one thing; if the built-in skills underneath it
differed from site to site, the same version would behave differently depending on where the work
landed. Built-in skills genuinely are coupled to the site's own runtime — they instruct an agent in
tools the site provides — but that coupling is a fact to declare, not a reason to distribute them
separately. Two sites differing is invisible; a declared version that does not match is not.

#### Version compatibility between hq and a site

**This rule already exists, and the package format joins it.**
[ADR-0046](../../adr/adr-0046-protocol-compatibility-between-hq-and-sites.md) settled it for the
protocol: majors must match or the connection is refused, minors may differ because a minor change is
additive only, and each end gates optional behaviour on the lower of the two levels rather than on its
own. Nothing here changes that. What it adds is that **the package format is versioned by the same
rule** — inside a major, a package's shape changes only by addition — so hq and a site still upgrade
independently within a major.

**A major mismatch suspends communication without unregistering.** The site stays registered and its
credential stays valid; hq dispatches nothing to it and reads nothing from it, and says why.
Resolution is to bring the site to hq's major: hq wins, whichever side is ahead. A site running ahead
of hq is suspended too — otherwise it speaks a contract hq does not know.

**Suspension is safe because the site owns its runtime data.** Transcripts, runs and tool-call logs
live in the site's own database, so nothing is lost while the versions disagree; the work becomes
readable again when they agree. The Execution Sites page shows this as its own state, with the
version required — "unreachable" would be wrong, since the link is fine and only the conversation is
not.

**When a site is behind what a package needs, hq refuses rather than sending older content.** Sending
an older package would appear to work and would put two sites back to behaving differently, which is
the outcome delivering the package exists to prevent.

#### hq's own storage

Task attachments, agent avatars and covers, the voice cache, org board templates and the org library's
skill sources are read by hq alone. They move to storage of hq's own, and three exposures close with
them:

- **A task attachment** is served by a link that cannot authenticate, as text whatever it is, and to
  any signed-in person. On hq's own storage it sits behind §6.4's ownership check and a route that
  knows what it is serving.
- **An avatar** is served by a route needing no sign-in at all, which follows links from a directory
  an agent can write.
- **The kernel's bootstrap files** are seeded where nothing reads them — `.private` directly under the
  agent directory, while everything else uses `workspace/.private`.

#### Over the control channel

The boundary's own data stays with the site, and hq asks for it:

- **Browsing and reading a location's files**, with §6.4's entitlement check applied by hq before it
  asks.
- **Seeding a new location's files** — the roadmap and project documents a new project starts with.
- **Connecting a repository and reading its state.** This belongs on the site for a reason beyond
  placement: hq runs git inside a directory an agent can write, and git obeys that directory's own
  configuration — hooks, filters that run during `git add`, and settings that send a push and its
  token to another host. Passing settings on each call stops some of it and not the rest, and hq's
  image has no git at all.

These need channel methods that carry file content, which today's channel does not have: it is JSON
text frames with a fifteen-second default timeout, no streaming and no binary.
[ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) admits
typed events and refuses a generic relay, so each is a named method, not a remote filesystem.

#### Removed

- **Agent directories** — provisioning, renaming and deleting them. §6.2 empties them, and a rename
  moves nothing because the package keys on the agent's id.
- **The kernel's agenda**, which §6.1 gives a home in the boundary.
- **The directory picker, the callerless routes and the duplicated path helpers** that the Phase 2
  inventory found, including the product directory helper §6.4 removes.

#### What this leaves open

- **What hq's own storage is** — a directory beside hq, or object storage — and how it is backed up.
- **How large content crosses the channel**, given a fifteen-second timeout and text frames: a
  package, a file being browsed, and an attachment are each bigger than anything crossing today.
- **What a site does when hq is unreachable** and it holds no cached package for the run it was
  asked to start.

### 6.6 Where preview runs

hq starts three kinds of container today, although under
[ADR-0050](../../adr/adr-0050-dispatch-and-status-cross-the-control-channel.md) it executes nothing.
Two of them stop being containers at all.

**Voice phrase generation becomes an ordinary model call.** hq runs a container with the kernel
agent's credentials mounted to ask a model for a one-line sample phrase. §6.3 gives hq a model
credential of its own, so this is a call — no container, and no agent's credentials on a disk.

**The onboarding runtime check becomes a question for the site.** hq asks its own machine whether
containers work, which once hq and a site are apart answers about the wrong machine. It becomes a
typed method: hq asks the site, the site answers, and onboarding reports the truth about the machine
that will do the work.

#### A preview is a process in the boundary's container

§6.1 already gives a boundary one container, bound to its storage, with the work in it. A dev server
runs inside that container rather than in a second one with a second mount of the same files, so it
serves exactly what the run sees.

An active preview must hold its container against idle teardown — the long-running-work case §6.1
records as open.

#### The browser reaches it through hq

A site accepts no inbound connections, so a browser cannot reach a preview directly. The site opens a
second outbound connection to hq for preview traffic, and hq proxies the browser into it. Every
connection is opened outward: the browser to hq, the site to hq. The site still listens on nothing.

**This is the topology chat already runs on.** A run's output leaves the site as a one-way frame on
the connection the site opened, and hq re-emits it into the browser's session room. Preview is that
shape with opaque bytes instead of typed events.

**Which is why it needs its own connection rather than the control channel.** hq validates every
frame a site sends against a known vocabulary before it reaches a browser, and that check is what
makes relaying safe. Preview traffic cannot be checked that way, and
[ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) refuses a
generic relay on the channel for exactly that reason. A separate transport keeps the channel's
guarantee intact instead of quietly weakening it.

#### hq as the single path, and what to do if it becomes a limit

Almost nothing a site does crosses to hq. Repository clones, builds, test runs, every file an agent
reads or writes, container memory, transcripts and run logs are all local to the site. What crosses is
what a person is watching: a dispatch, tokens while they read them, a file they opened, a status
change. Ten times the agent work is ten times the disk and processor across sites and roughly the same
conversation with hq.

**A site therefore buys capacity, storage, locality and blast radius — not a second way in.** hq
stays the one control plane and the one address, which is what lets a site sit on a laptop or an
on-prem machine behind a firewall.

**Preview is the exception**, and the only traffic that makes hq carry machine-scale volume for a
person-scale activity. Two things keep that from becoming a corner:

- **The relay is a separable component.** It can be given its own process or machine when it needs
  one, without the site or this design changing.
- **A direct path is available per site, and only where a bottleneck is actually seen.** An operator
  who can expose a site may publish its preview so the browser goes straight there; the default stays
  through hq.

**The direct path is a departure from [ADR-0044](../../adr/adr-0044-execution-site-registration-flow.md)
and [ADR-0045](../../adr/adr-0045-request-response-on-the-control-channel.md), and is recorded as
one.** Those records state that a site never accepts an inbound connection — no exceptions — and
ADR-0044 rejected a registration flow on that basis, calling it incompatible with the architecture
rather than merely inconvenient. An operator enabling a direct preview accepts what that rule
otherwise avoids: a reachable address, a certificate, and a machine holding everyone's files that now
listens. It is opt-in per site, off by default, and taken only against a measured problem — not a
quiet loosening of the rule for convenience.

#### What this leaves open

- **What the tunnel is** — its protocol, how a preview session authenticates on it, and how it is
  torn down when the preview ends or the container goes.
- **Whether the bulk transport §6.5 needs is the same connection**, since packages and file reads want
  to move real traffic too. One transport or two is a build decision, not a boundary one.
- **How a preview is addressed** in the browser, and how that address stays unguessable.

### 6.7 Reads across several sites

A second site is invisible today. One helper resolves "hq's own site" as the oldest-registered one and
warns when more than one exists — *until placement is real*, as its own comment says — and the
dashboard's run statistics, the storage listing and the repository list all go through it. Whatever
lives on another site is absent, silently.

**Placement replaces it.** §6.1 puts a run on the site holding its storage, so every boundary has a
site and hq knows which. That answers most reads on its own.

#### Two kinds of read

**Routed — one owner, one site.** A session's transcript, a run's log and tool calls, a location's
files, a repository's state. Each belongs to one boundary, and a boundary sits on one site. hq
resolves the owner and asks that site. Nothing fans out, and a second site changes nothing.

**Combined — no single owner.** Dashboard statistics, the activity feed, the storage listing, what is
running now. hq asks every site that is registered, unrevoked and version-compatible (§6.5), and
merges the answers.

#### A combined read is live, and says which sites answered

**hq keeps no copy of a site's data.** Totals are read when they are asked for, not remembered — a
site owns its runtime data, and a cached copy on hq would be the second master this design avoids
everywhere else.

**A site that does not answer is named, not omitted.** The view shows the figures from the sites that
replied and states plainly that another did not, and why — unreachable, or suspended on a version
mismatch. A total is true of the sites listed beneath it.

This extends a rule the code already follows: an unreachable site makes the dashboard return an
explicit unavailable flag rather than an empty set, because "no runs" and "cannot ask" must never look
the same. A partial answer is acceptable; a partial answer presented as whole is not.

**Failing the whole view is the wrong trade.** One asleep laptop would take the dashboard away from
the entire org, and the more sites an org runs, the more often nothing would work — punishing exactly
the deployment this unit exists to enable.

#### What this leaves open

- **How a combined feed pages and orders across sites**, which needs a cursor per site and a merge
  rather than one offset.
- **How long hq waits** for a site before treating it as not answering, and whether a slow site and a
  down one are shown differently.
- **Whether the dashboard alone later reads summaries a site pushes**, trading exactness for
  always-available figures. Recorded as a possibility, not built: it would put a copy of site data on
  hq, and the case for that is not made by a view that already works.

### 6.8 Credential rotation and invite rate limiting

**A site's machine credential remains persistent (no TTL).** Sites may run intermittently on developer laptops or manage autonomous agents without continuous operator presence. Enforcing an arbitrary time-based expiry would sever connections without improving security. Revocation (Phase 1) handles compromised credentials by closing the channel immediately and barring re-connection.

**Rotation is operator-initiated and zero-downtime.** Instead of unregistering and minting a new bootstrap registration token, a site rotates its credential in place:
1. The site's operator console triggers rotation via a local Wasp action. *(Changed by §6.9: an admin triggers it from hq's Execution Sites page, sent down the channel; the site then does steps 2–4 unchanged.)*
2. The site calls HQ's authenticated rotation endpoint `POST /api/v1/sites/rotate-credential`, presenting its current `connectionToken` in the `Authorization: Bearer <token>` header.
3. HQ validates the existing token hash against registered, unrevoked sites, generates a new cryptographically secure 32-byte token, updates the site's credential hash in HQ's database, and returns the plaintext token to the site.
4. The site updates its local `HqConnection.connectionToken` in its database and immediately reconnects the control channel socket with the new credential.

**`SITE_ADMIN_KEY` works only at bootstrap.** The environment key exists solely to create the initial administrator account on an empty instance. Once any user exists in the database (`prisma.user.count() > 0`), both `validateToken` and `acceptInviteToken` refuse `SITE_ADMIN_KEY` with `410 Gone` ("Bootstrap key no longer valid"). This prevents an environment secret from serving as a permanent backdoor once the system is active.

**The invite rate limit is durable and counts every request.**
- **Durable counter:** Rate limit state moves from an in-memory map to PostgreSQL (`RateLimit` table: `ip`, `count`, `resetAt`). Rate limit counters survive process restarts and apply across multiple load-balanced HQ instances.
- **Counting every request:** Both `validate` and `accept` increment the counter on every attempt before performing lookup logic. This eliminates timing and enumeration leaks where callers could probe token validity without decrementing available attempts.
- **Trust proxy enabled:** HQ enables Express `trust proxy` configuration (`app.set('trust proxy', 1)`) so client IP extraction correctly reads `X-Forwarded-For` from reverse proxies rather than lumping all requests under the proxy's IP.

### 6.9 Operator console authentication

**Records:** [ADR-0064](../../adr/adr-0064-a-site-registers-with-its-installers-and-an-admins-consent.md) registration · [ADR-0065](../../adr/adr-0065-a-site-serves-no-web-page.md) the site has no operator page. ADR-0064 supersedes ADR-0044's token-upfront registration flow.

A site's console today checks no one. The code says that is safe because the site binds to localhost
only, and it does not: Wasp's generated server calls `server.listen(port)` with no host, so the site
listens on every interface — which agent containers depend on to reach `/mcp` and the git-credential
endpoint through `host.docker.internal`. Anyone who can reach the port can register an unregistered
site or rotate a registered site's credential.

The question splits in two, and the halves have different answers. **Registration** happens once,
before the site trusts any hq. **Operating** — rotating the credential, unlinking, seeing status —
happens after, when the site already trusts its hq and holds a channel open to it.

#### Registration: the installer decides

**Registering a site takes two proofs: the person who installed it agrees, and an admin of the hq it
joins agrees.** A registration token proves only the second. An unregistered site is not ownerless —
someone installed it meaning to connect it to their own hq — and without the first proof, whoever
reaches it first can bind it to an hq they run themselves, and dispatch runs that start containers on
the installer's machine. The window reopens whenever a site is revoked.

**The installer's proof must exist before the gate opens.** Anything decided through a page the
network can reach is decided by whoever reaches it first. So the proof is something only the
installer can do on the machine itself, and nothing on the site is left for the network to register
through.

**A site registers in one of two ways.**

**By hand, with a command on the machine.** The same command on a laptop or on a VPS over SSH:

1. The installer runs `agenthix-site register <hq-url>` on the machine. Running it is the installer's
   proof, and it is what sets the hq the site joins.
2. The site asks that hq for a short code, over an outbound request like every other it makes, and
   prints a link and the code, then waits.
3. The installer opens the link in any browser, logs in to hq as an admin, and approves. hq's
   approval page shows what is asking — site name, host name, the address it connected from, when the
   code expires — so an admin can tell their own machine from someone else's.
4. The site, polling hq, receives its machine credential and opens the channel.

This is the device authorization flow ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)). A code
that is not approved expires after 15 minutes, and only an admin can approve one.

**Automated, started from hq.** When hq creates the machine itself — a site started from hq on a
cloud provider — nobody is at the machine to read a code, so the approval comes first: a logged-in
admin choosing to create the site is the approval. hq passes the new machine its URL and a one-time,
already-approved token in the machine's startup configuration; the site presents it on first boot and
the token is spent. The installer's proof is that hq created the machine. The site side of this —
registering from `HQ_URL` and `HQ_REGISTRATION_TOKEN` at boot — already exists.

**What goes away.** The registration form on the site's status page, and admins minting tokens for
someone to paste into a site. The only tokens are the ones hq mints for machines it creates.

#### Operating a registered site

**Everything that changes a registered site's standing with hq is done from hq**, by an admin logged
in there, and sent to the site over the channel it opened:

- **Rotating the credential** moves from the button on the site's status page to hq's Execution Sites
  page. hq sends a rotate request down the channel; the site then does what §6.8 already has it do —
  calls hq's rotation endpoint with its current credential, saves the new one, reconnects. Only who
  presses the button moves.
- **Revoking** is already hq's (Phase 1), and takes effect even while the site is offline.

**What belongs to the machine is done on the machine**, with the same command as registration:

- `agenthix-site status` shows which hq the site is linked to, and whether it is connected, retrying
  with its last error, or revoked. It works when hq cannot be reached, which is when it matters.
- `agenthix-site unregister` takes the site out of hq — telling hq it is leaving if hq is reachable,
  then forgetting its credential — so `register` works again. The installer chose to join, so the
  machine can always leave.

**The site has no operator page.** The status page and both of its actions are removed, and the
site's listener carries what agent containers need and a liveness check; `/` shows only a fixed
sentence, because Wasp requires one route. A page on `localhost` looks private and is
not: every program on the machine can reach it, and so can any web page open in the operator's own
browser, which is how local admin pages are routinely attacked. With no operator page, there is
nothing to guard.

**The graphical way in is a desktop app, not a page on the site.** A person running a site on their
own computer should not need a terminal; a desktop app that installs the site, starts it on boot,
registers it and shows its status gives them that. It drives the same command inside the site's
container, so being allowed to control that container remains the proof, and it opens no port.
Until it exists, a site on someone's own computer is registered with one command, and is operated
and watched from hq.

#### What this leaves open

- **The desktop app** — installing the site, starting it on boot, registering it, showing its status,
  and later an administration view of what is running on the site and for whom. That view shows org
  data, so it will need an hq login rather than only control of the machine. Raised as its own issue.
- **Automation that is not hq's own.** Whether hq keeps a way for an admin to mint an already-approved
  token by hand, for provisioning tools other than hq's.
- **Being tricked into approving.** An admin who approves a code for someone else's machine puts that
  machine in the org, and the org's work goes to it. The approval page, the short expiry and
  admin-only approval are the defences; whether hq also limits or notifies on approvals is a build
  question.
- **How the command reaches the running site** — its database, or a Unix socket on the running
  server, never a network port — is settled in the build.
- **Creating machines from hq** — the cloud provider integration behind *New site* — is not part of
  this unit; this unit keeps the site side that it needs.

### 6.10 The deployment shape

**Records:** [ADR-0066](../../adr/adr-0066-a-site-reaches-its-agents-over-a-private-network-per-boundary.md) agents over a private network per boundary · [ADR-0067](../../adr/adr-0067-hq-ends-at-one-plain-http-port.md) hq ends at one plain-HTTP port · [ADR-0068](../../adr/adr-0068-hqs-browser-app-is-built-for-its-address.md) hq's browser app is built for its address · [ADR-0069](../../adr/adr-0069-images-are-built-with-only-docker.md) images are built with only Docker.

Nothing deployable followed the split. Only hq had images, and hq's still installed the Docker and
Claude Code tools and mounted the machine's Docker socket and a site's folder. hq's web container
forwarded neither the site channel nor the content transport, so a site on another machine could not
connect through it, and it passed a caller's own forwarded address straight through. The site had no
image at all. The compose files for servers still described services that left this repository.

#### Where each piece runs

| Machine | Runs | Reachable from outside |
|---|---|---|
| hq's | hq-web (Caddy), hq-server, hq-db | hq-web's one port, behind the machine's front door |
| A site's | site-server, site-db, agent containers | Nothing |

People and sites reach hq only. A site dials out to hq; agents dial the site; nothing dials a site.
On one computer the two machines merge and nothing else changes.

#### A site

- **One server image.** No browser app is built or shipped. Its listener carries `/mcp` and the
  git-credential endpoint for agents and `/health` for the container runtime; `/` answers not found.
- **Agents reach it over a private network per storage boundary** (ADR-0066). When the site creates a
  boundary's container it creates that boundary's network, joins it and starts the container on it;
  the network's only members are that container and the site, and both are removed together. Agents
  address the site by container name. The site publishes no port. Its database is on a network no
  agent is on. Traffic only goes from an agent to the site — the site reaches a preview by a relay run
  inside the container — so no boundary's container can reach another's. The site gives each network
  a small address block from a configurable private range, because Docker's default runs out after a
  few dozen networks. The address agents are given is its own setting; in development, where the site
  runs on the machine, agents reach it through the machine, each container still on its own network.
- **One data folder, at the same path inside and outside the container.** Docker resolves an agent's
  mount on the machine, not in the site's container, so the two paths used to be separate settings
  that had to agree — and when they disagreed an agent silently got an empty folder. Mounting the
  folder at its own path makes the site's path the machine's, and `AGENT_SITE_PATH` goes. Each
  environment keeps its own folder: development unchanged, the local containerised stack
  `~/.agenthix.local/site`, a server `~/.agenthix/site` by default — home-folder paths, because Docker
  Desktop mounts only shared locations.
- **The agent image belongs to the site.** Its Dockerfile and the git-credential helper move into
  `site/`, and the site's compose file builds it, so a machine with no hq can build it.
- **The site stays on Wasp for now.** It uses little of it — the Prisma client, four `api` routes, the
  startup hook, the build — and has no pages. Leaving Wasp goes with the desktop app, which gives the site a graphical front
  end that is not a web page.

#### hq's own site

Every install brings hq and one site, on the same machine, as a pair. The organisation decides
whether its operation stays on that machine or is managed elsewhere; nothing here decides that for it.

The pair is connected by configuration, not registration. The installer sets one secret in hq's and the
site's environment files. The site presents it as its credential every time it connects; at every boot hq
makes sure the default site's row exists with that secret as its credential. There is nothing to
approve, and nothing to repair: a wiped hq database or site database is rebuilt from the same secret at
the next start. A site that is not running shows as offline, with how to start it.

The default site cannot be revoked or removed, because an organisation must always have one. Its secret
is rotated by changing it in both files and restarting. It is a real service running beside hq, not a row
hq invents. Every other site still registers with an installer's and an admin's consent, below.

#### Registering a deployed site

The same command in every environment, run where the site runs (ADR-0064 unchanged):
`docker compose exec site agenthix-site register <hq-url>` in a container, `npm run site -- register
<hq-url>` in development. Controlling Docker on the machine is the installer's proof.

- **The command is on the image's path.** Wasp's generated image carries only the server.
- **In the image, the control socket lives at a path only inside the container**
  (`/run/agenthix-site/control.sock`), not in the mounted data folder — otherwise an account on the
  machine that owns that folder could drive it without Docker. Development keeps
  `<SITE_ROOT>/run/control.sock`. A site whose socket path exceeds the Unix limit refuses to start
  rather than starting without it.
- **The command refuses a remote `http://` hq address.** Registration ends with hq handing the site its
  credential. `localhost` and private network addresses are allowed.
- **The site no longer sends its own address, and the approval page no longer shows one.** A deployed
  site has none, and the value was self-reported and unchecked. The field and columns stay, holding
  null.
- **The approval page separates what the site claims** — its name and host name — **from what hq
  observed**: the address it connected from. The admin's judgement is the defence against approving
  someone else's machine (§6.9), and they should know which details can be made up.
- `HQ_URL` and `HQ_REGISTRATION_TOKEN` stay, documented as the path for machines hq creates, not
  something a self-hoster sets.

#### hq

- **hq's stack ends at one plain-HTTP port** (ADR-0067): hq-web, hq-server, hq-db. hq-web is Caddy; it
  serves the browser app and forwards every server path — `/api`, `/auth`, `/operations`,
  `/socket.io`, `/hq-link`, `/hq-content`, preview and the file routes. It listens on `127.0.0.1` by
  default; a setting opens it to the network.
- **The trusted-proxy count is one setting**, applied to hq-web and hq-server alike, replacing the
  fixed single hop. With nothing in front of hq-web it is one; each proxy in front adds one. Caddy
  ignores a forwarded address from anything it does not trust, which is what stops a caller supplying
  their own.
- **The machine's front door is the machine owner's.** The documentation gives a snippet for Traefik,
  Caddy and nginx, each with the trusted-proxy count it needs.
- **An optional front door is shipped separately** — its own small compose stack, a Caddy that holds
  ports 80 and 443 and gets certificates automatically, with hq as its first entry. It carries the
  warning in its compose file, its configuration and the documentation: it becomes the front door
  for the whole machine, other applications then route through it, and it is not for a machine that
  already has one. It refuses to start if 80 or 443 are taken. Its certificates live on a persistent
  volume. It needs the machine reachable from the internet.
- **hq's image carries nothing for execution.** Its Dockerfile no longer installs the Docker or Claude
  Code tools; its compose file mounts no Docker socket, no site folder and no Claude login; its
  startup checks and settings page no longer ask for `AGENT_SITE_PATH` or `DOCKER_GID`. hq has
  executed nothing since Phase 9, and the Docker socket gave the one internet-facing app control of
  the machine.
- **hq-web is built on the machine that runs it, with that machine's address** (ADR-0068). Wasp fixes
  the address when the browser app is built, requires it to be absolute, and connects from it the
  moment the app loads. The build is one step whose only input is the address. hq-server and the site
  read their settings at start and are the same image everywhere.

#### Building

**Images are built entirely inside Docker** (ADR-0069). Each Wasp app's Dockerfile starts with a
builder stage that installs a pinned Wasp CLI and runs `wasp build` over the whole repository, so
`core` and `ui` are present as they are — the copying into the build and the patching of Wasp's
generated Dockerfile go. `docker compose up --build` is the whole build. Wasp 0.21's Linux CLI is
Intel-only, so the builder stage is fixed to Intel and emulated on ARM machines; the final images are
native.

#### What the repository ships

- `hq/`: its compose file (hq-web, hq-server, hq-db) with an environment example, its Dockerfiles and
  Caddy configuration.
- `site/`: its compose file (site, site-db, the agent image) with an environment example, and its
  Dockerfiles.
- The optional front door, as its own stack.
- A root compose file that runs both on one machine as separate projects, for the local containerised
  environment; the development database compose file is unchanged. Local and a server run the same
  compose files; only the environment differs.
- A deployment guide: the three machine arrangements, the front-door snippets, registering a site,
  and what a machine needs (Docker, and Intel emulation on ARM).

**What leaves the repository:** nginx and its configurations; every Traefik reference; the LAN and
server compose overrides; hq's image-building and deployment scripts. The deployment of our own
server is no longer part of this repository — it ships only what any self-hoster runs.

#### How it is proven

hq as a separate test deployment on a server behind its real front door, and a site on a Mac on a
home network, both from these compose files, the way a self-hoster would deploy them. The site
registers with the command, then completes one chat and one task run with a real model. That covers
public HTTPS, the internet between them, a site behind a router, and no shared disk, Docker or
`localhost`. The one-machine containerised stack is the fast loop while building. No automated test
completes a run today; a containerised test tier with a stand-in model belongs with CI.

#### What this leaves open

- **Moving hq to a new address, and upgrading an install.** Every site dials the hq address it
  registered with, and re-pointing one today means registering again. Upgrading applies database
  migrations at start, and an install from before the split needs its old site folder mounted once
  for hq's one-time relocation. Both are questions about migrating an install, not about deploying one.
- **Publishing ready-made images**, and how hq's browser app is made portable when it is — decided with
  the release.
- **The site's data folder is owned by one fixed user id on the machine.**
